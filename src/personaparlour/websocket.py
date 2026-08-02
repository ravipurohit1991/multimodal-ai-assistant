"""
WebSocket Handler - Real-time voice/text interaction via WebSocket
"""

import asyncio
import base64
import json
import os
import re
import time
from datetime import datetime
from urllib.parse import urlparse

from fastapi import WebSocket, WebSocketDisconnect

from personaparlour.character_cards import (
    GENERATE_TIMEOUT_SECONDS as CARD_TIMEOUT_SECONDS,
)
from personaparlour.character_cards import (
    generate_card as generate_character_card,
)
from personaparlour.character_study import (
    HARVEST_TIMEOUT_SECONDS as STUDY_HARVEST_TIMEOUT_SECONDS,
)
from personaparlour.character_study import (
    REFLECT_TIMEOUT_SECONDS as STUDY_REFLECT_TIMEOUT_SECONDS,
)
from personaparlour.character_study import (
    WATCH_TIMEOUT_SECONDS as STUDY_WATCH_TIMEOUT_SECONDS,
)
from personaparlour.character_study import (
    build_drift_note,
    harvest_study,
    is_locked,
    merge_observations,
    new_trait,
    normalize_traits,
    rebuild_study,
    reflect,
    reset_study,
    set_lock,
    studied_names,
    update_trait,
    watch_reply,
)
from personaparlour.character_study import (
    cast_names as study_cast_names,
)
from personaparlour.character_study import (
    interval as study_interval,
)
from personaparlour.character_study import (
    pending_count as study_pending_count,
)
from personaparlour.character_study import (
    should_reflect as should_reflect_study,
)
from personaparlour.character_study import (
    should_watch as should_watch_study,
)
from personaparlour.config import config
from personaparlour.continuity import (
    HARVEST_TIMEOUT_SECONDS,
    REVIEW_TIMEOUT_SECONDS,
    apply_revision,
    build_continuity_note,
    harvest_canon,
    merge_facts,
    new_fact,
    normalize_facts,
    rebuild_canon,
    reset_canon,
    review_reply,
)
from personaparlour.control_tags import (
    MOOD_TAG_RE,
    SCENE_TAG_RE,
    StreamingHiddenTagFilter,
    StreamingSpeakerPrefixFilter,
    find_animation_tag_body,
    generate_animation_directive_from_reply,
    parse_animation_tag,
    strip_animation_tags,
    strip_speaker_prefix,
)
from personaparlour.engine_manager import engine_manager
from personaparlour.llm import default_chat_options, get_chat_client
from personaparlour.memory import (
    MAX_KEEP_RECENT,
    MAX_SUMMARY_CHARS,
    MAX_TRIGGER,
    MIN_KEEP_RECENT,
    MIN_TRIGGER,
    PASS_TIMEOUT_SECONDS,
    conversation_messages,
    memory_cursor,
    pending_count,
    reset_memory,
    should_summarize,
    summarize_story,
)
from personaparlour.prompts import (
    DEFAULT_ROLEPLAY_PROMPT,
    build_chat_system_prompt,
    build_image_prompt_messages,
    build_impersonation_messages,
    build_reply_suggestion_messages,
    build_speaker_selection_messages,
    select_speaker_candidate,
)
from personaparlour.roleplay import (
    PRESENCE_MODES,
    apply_placeholders,
    build_llm_messages,
    build_presence_directive,
    build_stop_sequences,
    parse_scene_tag,
    presence_max_beats,
    reply_token_ceiling,
    trimmed_side_task_history,
)
from personaparlour.sightlines import (
    HARVEST_TIMEOUT_SECONDS as SIGHTLINE_HARVEST_TIMEOUT_SECONDS,
)
from personaparlour.sightlines import (
    REVIEW_TIMEOUT_SECONDS as SIGHTLINE_REVIEW_TIMEOUT_SECONDS,
)
from personaparlour.sightlines import (
    build_leak_note,
    grant_knowledge,
    reset_sightlines,
)
from personaparlour.sightlines import (
    harvest_sightlines as harvest_sightline_entries,
)
from personaparlour.sightlines import (
    merge_entries as merge_sightline_entries,
)
from personaparlour.sightlines import (
    new_entry as new_sightline_entry,
)
from personaparlour.sightlines import (
    normalize_entries as normalize_sightline_entries,
)
from personaparlour.sightlines import (
    participants as sightline_participants,
)
from personaparlour.sightlines import (
    rebuild_sightlines as rebuild_sightline_entries,
)
from personaparlour.sightlines import (
    review_reply as review_sightlines,
)
from personaparlour.sightlines import (
    should_review as should_review_sightlines,
)
from personaparlour.state import (
    ConnState,
    cancel_character_study,
    cancel_continuity,
    cancel_llm,
    cancel_memory,
    cancel_sightlines,
    cancel_story_threads,
    wipe_connection_state,
)
from personaparlour.story_threads import (
    THREAD_HARVEST_TIMEOUT_SECONDS,
    THREAD_UPDATE_TIMEOUT_SECONDS,
    new_story_thread,
    normalize_story_threads,
    reset_story_threads,
    should_update_story_threads,
    story_thread_cursor,
    update_story_threads,
)
from personaparlour.tts import StreamingExpressionTracker
from personaparlour.utils import (
    image_to_base64,
    logger,
    phrase_chunker,
    save_image_to_disk,
    wipe_user_data,
)
from personaparlour.utils.text_filter import StreamingTextFilter


def _wipe_origin_allowed(origin: str, host: str) -> bool:
    """Whether a browser Origin may invoke destructive actions like wipe_all.

    Browsers always send an Origin header on WebSocket upgrades, so this blocks
    cross-site pages from driving destructive actions; non-browser clients
    (which omit Origin) are unaffected.
    """
    try:
        origin_host = (urlparse(origin).hostname or "").lower()
    except ValueError:
        return False
    if origin_host in ("localhost", "127.0.0.1"):
        return True
    if origin_host and origin_host == host.split(":", 1)[0].lower():
        return True
    return origin in config.cors_allow_origins


async def ws_endpoint(ws: WebSocket):
    """Main WebSocket endpoint for real-time voice/text interaction"""
    await ws.accept()
    state = ConnState()

    logger.info("WebSocket client connected")
    logger.debug(f"System prompt preview: {state.messages[0]['content'][:200]}...")

    async def send_json(obj: dict):
        """Helper to send JSON messages with error handling"""
        try:
            await ws.send_text(json.dumps(obj))
        except Exception as e:
            # Connection already closed, silently fail
            if "disconnect" in str(e).lower() or "closed" in str(e).lower():
                logger.warning(
                    f"WebSocket already disconnected, skipping message: {obj.get('type', 'unknown')}"
                )
            else:
                raise

    # Send initial configuration to client
    await send_json(
        {
            "type": "config",
            "tts_engine": config.tts_engine,
            "llm_model": config.llm_model,
            "output_mode": state.output_mode,
        }
    )

    def memory_state_payload(extra: dict | None = None) -> dict:
        """The client's whole view of Story Memory, sent after every change."""
        history = conversation_messages(state)
        payload = {
            "type": "memory_updated",
            "summary": state.memory_summary,
            "covered": memory_cursor(state, len(history)),
            "total": len(history),
            "pending": pending_count(state),
            "enabled": state.memory_enabled,
            "auto": state.memory_auto,
            "keep_recent": state.memory_keep_recent,
            "trigger": state.memory_trigger,
        }
        if extra:
            payload.update(extra)
        return payload

    async def run_memory_update(force: bool = False):
        """One Story Memory pass, reported to the UI at both ends."""
        try:
            await send_json({"type": "memory_status", "busy": True})
            async with state.auxiliary_lock:
                result = await asyncio.wait_for(
                    summarize_story(state, force=force), timeout=PASS_TIMEOUT_SECONDS
                )
            if result is None:
                await send_json(memory_state_payload({"unchanged": True}))
                return
            state.memory_summary, state.memory_covered = result
            await send_json(memory_state_payload())
        except asyncio.CancelledError:
            logger.info("Story memory pass cancelled")
            raise
        except TimeoutError:
            logger.error(f"Story memory pass timed out after {PASS_TIMEOUT_SECONDS}s")
            await send_json(memory_state_payload({"unchanged": True}))
        except Exception as e:
            logger.error(f"Story memory pass failed: {e}")
            await send_json(memory_state_payload({"unchanged": True}))
        finally:
            try:
                await send_json({"type": "memory_status", "busy": False})
            except Exception:
                pass  # connection likely gone

    def schedule_memory_update(force: bool = False):
        """Start a summarization pass in the background, at most one at a time.

        Deliberately fire-and-forget and kept out of ``state.llm_task``: the user
        should never wait on (or accidentally cancel) memory upkeep by sending
        their next message.
        """
        if not state.memory_enabled:
            return False
        if state.memory_task and not state.memory_task.done():
            return False
        if not force and not (state.memory_auto and should_summarize(state)):
            return False
        state.memory_task = asyncio.create_task(run_memory_update(force))
        return True

    def canon_state_payload(extra: dict | None = None) -> dict:
        """The client's whole view of the Continuity Guard, sent after every change."""
        payload = {
            "type": "canon_updated",
            "facts": state.canon,
            "enabled": state.continuity_enabled,
            "auto": state.continuity_auto,
            "covered": state.canon_covered,
            "total": len(conversation_messages(state)),
        }
        if extra:
            payload.update(extra)
        return payload

    async def run_continuity_check(reply_text: str):
        """One check of the latest reply against the canon, reported to the UI.

        Any contradiction is only ever *reported*. Nothing about the story is
        rewritten here — the reply stays exactly as it arrived until the user
        picks what to do about it.
        """
        try:
            await send_json({"type": "continuity_status", "busy": True})
            async with state.auxiliary_lock:
                result = await asyncio.wait_for(
                    review_reply(state, reply_text), timeout=REVIEW_TIMEOUT_SECONDS
                )
            if result is None:
                return

            added = 0
            if result["facts"]:
                state.canon, added = merge_facts(state.canon, result["facts"])
            state.canon_covered = len(conversation_messages(state))

            contradictions = result["contradictions"]
            if contradictions:
                state.continuity_alert = {"items": contradictions}
                logger.info(
                    f"Continuity: {len(contradictions)} contradiction(s) in the latest reply"
                )
                await send_json({"type": "continuity_alert", "items": contradictions})
            else:
                state.continuity_alert = None
            if added or contradictions:
                await send_json(canon_state_payload())
        except asyncio.CancelledError:
            logger.info("Continuity check cancelled")
            raise
        except TimeoutError:
            logger.error(f"Continuity check timed out after {REVIEW_TIMEOUT_SECONDS}s")
        except Exception as e:
            logger.error(f"Continuity check failed: {e}")
        finally:
            try:
                await send_json({"type": "continuity_status", "busy": False})
            except Exception:
                pass  # connection likely gone

    def schedule_continuity_check(reply_text: str, force: bool = False) -> bool:
        """Start a check in the background, at most one at a time.

        Fire-and-forget and kept out of ``state.llm_task`` for the same reason
        memory upkeep is: the user should never wait on — or accidentally cancel
        — the guard by sending their next message.
        """
        if not state.continuity_enabled:
            return False
        if not force and not state.continuity_auto:
            return False
        if state.continuity_task and not state.continuity_task.done():
            return False
        if not reply_text.strip():
            return False
        state.continuity_task = asyncio.create_task(run_continuity_check(reply_text))
        return True

    async def run_canon_harvest():
        """Read the whole story and fold what it established into the ledger."""
        try:
            await send_json({"type": "continuity_status", "busy": True})
            async with state.auxiliary_lock:
                facts = await asyncio.wait_for(
                    harvest_canon(state), timeout=HARVEST_TIMEOUT_SECONDS
                )
            if not facts:
                await send_json(canon_state_payload({"unchanged": True}))
                return
            state.canon, added = rebuild_canon(state.canon, facts)
            state.canon_covered = len(conversation_messages(state))
            logger.info(
                f"Canon rebuilt from the story: {added} fact(s) read, ledger now {len(state.canon)}"
            )
            await send_json(canon_state_payload({"added": added}))
        except asyncio.CancelledError:
            logger.info("Canon harvest cancelled")
            raise
        except TimeoutError:
            logger.error(f"Canon harvest timed out after {HARVEST_TIMEOUT_SECONDS}s")
            await send_json(canon_state_payload({"unchanged": True}))
        except Exception as e:
            logger.error(f"Canon harvest failed: {e}")
            await send_json(canon_state_payload({"unchanged": True}))
        finally:
            try:
                await send_json({"type": "continuity_status", "busy": False})
            except Exception:
                pass  # connection likely gone

    def story_threads_state_payload(extra: dict | None = None) -> dict:
        """The client's complete Story Threads ledger and exact history cursor."""
        history = conversation_messages(state)
        payload = {
            "type": "story_threads_updated",
            "threads": state.story_threads,
            "enabled": state.story_threads_enabled,
            "auto": state.story_threads_auto,
            "covered": story_thread_cursor(state, len(history)),
            "total": len(history),
        }
        if extra:
            payload.update(extra)
        return payload

    # Set when a reply completes during the worker's narrow shutdown window.
    # Without this latch, the scheduler could see the old task still alive just
    # after it made its final pending check and lose that newest turn.
    story_threads_rescan_requested = False
    # The Character Study shares one worker between its learning pass and its
    # adherence check, so it needs the same latch for the same reason.
    study_rescan_requested = False

    async def run_story_threads_update(*, force: bool = False, rebuild: bool = False):
        """Run one or more serialized scans without delaying the visible reply.

        Incremental passes deliberately coalesce: if another reply lands while a
        scan is reading, the same background task keeps going until it catches
        the cursor up. A full rebuild is one atomic whole-story pass.
        """
        timeout = THREAD_HARVEST_TIMEOUT_SECONDS if rebuild else THREAD_UPDATE_TIMEOUT_SECONDS
        cancelled = False
        try:
            nonlocal story_threads_rescan_requested
            await send_json({"type": "story_threads_status", "busy": True})
            while True:
                before = story_thread_cursor(state, len(conversation_messages(state)))
                async with state.auxiliary_lock:
                    result = await asyncio.wait_for(
                        update_story_threads(state, force=force, rebuild=rebuild),
                        timeout=timeout,
                    )

                if result is None:
                    await send_json(story_threads_state_payload({"unchanged": True}))
                    break

                # The domain layer returns a complete proposed ledger and never
                # mutates connection state. Store both pieces together so the UI
                # can never observe a new cursor paired with an old ledger.
                state.story_threads = result["threads"]
                state.story_threads_covered = result["covered"]
                changes = {
                    key: result[key]
                    for key in ("added", "updated", "resolved", "dropped", "removed")
                }
                if not result["changes"]:
                    changes["unchanged"] = True
                await send_json(story_threads_state_payload(changes))

                if rebuild:
                    break

                history = conversation_messages(state)
                after = story_thread_cursor(state, len(history))
                if after <= before:
                    # A broken model response must not turn the background worker
                    # into a tight retry loop.
                    logger.warning("Story thread pass made no cursor progress; stopping")
                    break
                has_pending = after < len(history)
                if not has_pending:
                    break
                if not force and not should_update_story_threads(state):
                    break
                story_threads_rescan_requested = False
        except asyncio.CancelledError:
            cancelled = True
            logger.info("Story thread pass cancelled")
            raise
        except TimeoutError:
            logger.error(f"Story thread pass timed out after {timeout}s")
            await send_json(story_threads_state_payload({"unchanged": True}))
        except Exception as e:
            logger.error(f"Story thread pass failed: {e}")
            await send_json(story_threads_state_payload({"unchanged": True}))
        finally:
            try:
                await send_json({"type": "story_threads_status", "busy": False})
            except Exception:
                pass  # connection likely gone
            if (
                not cancelled
                and story_threads_rescan_requested
                and should_update_story_threads(state)
            ):
                # ``call_soon`` runs after this coroutine has become done, so the
                # one-worker guard accepts the catch-up task.
                asyncio.get_running_loop().call_soon(schedule_story_threads_update)

    def schedule_story_threads_update(*, force: bool = False, rebuild: bool = False) -> bool:
        """Queue a Story Threads pass, with at most one worker per connection."""
        nonlocal story_threads_rescan_requested
        if not state.story_threads_enabled:
            return False
        if state.story_threads_task and not state.story_threads_task.done():
            story_threads_rescan_requested = True
            return False
        if not force and not rebuild and not should_update_story_threads(state):
            return False
        story_threads_rescan_requested = False
        state.story_threads_task = asyncio.create_task(
            run_story_threads_update(force=force, rebuild=rebuild)
        )
        return True

    def sightlines_state_payload(extra: dict | None = None) -> dict:
        """The client's whole view of Sightlines, sent after every change.

        The participant list travels with it: the browser owns the roster, but the
        backend is the one that decides which names an entry's audience may name,
        so the UI must build its grid from the same list the ledger was filtered
        against.
        """
        payload = {
            "type": "sightlines_updated",
            "entries": state.sightlines,
            "enabled": state.sightlines_enabled,
            "auto": state.sightlines_auto,
            "participants": sightline_participants(state),
            "covered": state.sightlines_covered,
            "total": len(conversation_messages(state)),
        }
        if extra:
            payload.update(extra)
        return payload

    async def run_sightlines_check(reply_text: str, speaker: str):
        """One check of the latest reply for leaked knowledge, reported to the UI.

        A leak is only ever *reported*. Knowledge that plainly changed hands in
        the passage is applied, because that is the story saying so rather than a
        judgement call — but a character using something they were never told is
        the user's to resolve.
        """
        try:
            await send_json({"type": "sightlines_status", "busy": True})
            async with state.auxiliary_lock:
                result = await asyncio.wait_for(
                    review_sightlines(state, reply_text, speaker),
                    timeout=SIGHTLINE_REVIEW_TIMEOUT_SECONDS,
                )
            if result is None:
                return

            granted = 0
            for transfer in result["learned"]:
                if grant_knowledge(state, transfer["entry_id"], transfer["who"]):
                    granted += 1
            state.sightlines_covered = len(conversation_messages(state))

            leaks = result["leaks"]
            if leaks:
                state.sightline_alert = {"items": leaks, "speaker": speaker}
                logger.info(f"Sightlines: {len(leaks)} leak(s) in the latest reply")
                await send_json({"type": "sightline_alert", "items": leaks, "speaker": speaker})
            else:
                state.sightline_alert = None
            if granted:
                logger.info(f"Sightlines: knowledge changed hands {granted} time(s)")
            if granted or leaks:
                await send_json(sightlines_state_payload())
        except asyncio.CancelledError:
            logger.info("Sightlines check cancelled")
            raise
        except TimeoutError:
            logger.error(f"Sightlines check timed out after {SIGHTLINE_REVIEW_TIMEOUT_SECONDS}s")
        except Exception as e:
            logger.error(f"Sightlines check failed: {e}")
        finally:
            try:
                await send_json({"type": "sightlines_status", "busy": False})
            except Exception:
                pass  # connection likely gone

    def schedule_sightlines_check(reply_text: str, speaker: str, force: bool = False) -> bool:
        """Start a check in the background, at most one at a time.

        Fire-and-forget and kept out of ``state.llm_task``, like every other piece
        of upkeep: the user should never wait on — or accidentally cancel — a
        background check by sending their next message.
        """
        if not state.sightlines_enabled:
            return False
        if not force and not should_review_sightlines(state):
            return False
        if state.sightlines_task and not state.sightlines_task.done():
            return False
        if not reply_text.strip():
            return False
        state.sightlines_task = asyncio.create_task(run_sightlines_check(reply_text, speaker))
        return True

    async def run_sightlines_harvest():
        """Read the whole story and map who has been kept out of what."""
        try:
            await send_json({"type": "sightlines_status", "busy": True})
            async with state.auxiliary_lock:
                entries = await asyncio.wait_for(
                    harvest_sightline_entries(state),
                    timeout=SIGHTLINE_HARVEST_TIMEOUT_SECONDS,
                )
            if not entries:
                await send_json(sightlines_state_payload({"unchanged": True}))
                return
            state.sightlines, added = rebuild_sightline_entries(state.sightlines, entries)
            state.sightlines_covered = len(conversation_messages(state))
            logger.info(
                f"Sightlines rebuilt from the story: {added} entr(ies) read, "
                f"ledger now {len(state.sightlines)}"
            )
            await send_json(sightlines_state_payload({"added": added}))
        except asyncio.CancelledError:
            logger.info("Sightlines harvest cancelled")
            raise
        except TimeoutError:
            logger.error(f"Sightlines harvest timed out after {SIGHTLINE_HARVEST_TIMEOUT_SECONDS}s")
            await send_json(sightlines_state_payload({"unchanged": True}))
        except Exception as e:
            logger.error(f"Sightlines harvest failed: {e}")
            await send_json(sightlines_state_payload({"unchanged": True}))
        finally:
            try:
                await send_json({"type": "sightlines_status", "busy": False})
            except Exception:
                pass  # connection likely gone

    def character_study_state_payload(extra: dict | None = None) -> dict:
        """The client's whole view of the Character Study, sent after every change.

        The cast travels with it for the same reason it does with Sightlines: the
        browser owns the roster, but the backend decides which names a study may
        be about, so the card must be built from the list the sheets were filtered
        against.
        """
        payload = {
            "type": "character_study_updated",
            "traits": state.studies,
            "enabled": state.character_study_enabled,
            "auto": state.character_study_auto,
            "watch": state.character_study_watch,
            "interval": study_interval(state),
            "locked": state.study_locked,
            "cast": study_cast_names(state),
            "studied": studied_names(state),
            "covered": state.studies_covered,
            "total": len(conversation_messages(state)),
        }
        if extra:
            payload.update(extra)
        return payload

    async def run_study_reflection():
        """One batched pass over the turns nobody has read for the cast yet."""
        nonlocal study_rescan_requested
        cancelled = False
        try:
            await send_json({"type": "character_study_status", "busy": True})
            async with state.auxiliary_lock:
                observed = await asyncio.wait_for(
                    reflect(state), timeout=STUDY_REFLECT_TIMEOUT_SECONDS
                )
            # The cursor advances either way. A pass that read the turns and found
            # nothing worth recording has still done its job, and re-reading them
            # could never firm anything up anyway (see ``merge_observations``).
            state.studies_covered = len(conversation_messages(state))
            if not observed:
                await send_json(character_study_state_payload({"unchanged": True}))
                return
            locked = frozenset(
                name.strip().casefold() for name in (state.study_locked or []) if name.strip()
            )
            state.studies, added, confirmed = merge_observations(
                state.studies,
                observed,
                turn=len(conversation_messages(state)),
                locked=locked,
            )
            logger.info(
                f"Character study: {added} new observation(s), {confirmed} confirmed, "
                f"sheet now {len(state.studies)}"
            )
            await send_json(character_study_state_payload({"added": added, "confirmed": confirmed}))
        except asyncio.CancelledError:
            cancelled = True
            logger.info("Character study pass cancelled")
            raise
        except TimeoutError:
            logger.error(f"Character study pass timed out after {STUDY_REFLECT_TIMEOUT_SECONDS}s")
            await send_json(character_study_state_payload({"unchanged": True}))
        except Exception as e:
            logger.error(f"Character study pass failed: {e}")
            await send_json(character_study_state_payload({"unchanged": True}))
        finally:
            try:
                await send_json({"type": "character_study_status", "busy": False})
            except Exception:
                pass  # connection likely gone
            if not cancelled and study_rescan_requested and should_reflect_study(state):
                # ``call_soon`` runs after this coroutine is done, so the
                # one-worker guard accepts the catch-up task.
                asyncio.get_running_loop().call_soon(schedule_study_reflection)

    def schedule_study_reflection(*, force: bool = False) -> bool:
        """Queue a learning pass, with at most one study worker per connection."""
        nonlocal study_rescan_requested
        if not state.character_study_enabled:
            return False
        if state.study_task and not state.study_task.done():
            study_rescan_requested = True
            return False
        if not force and not should_reflect_study(state):
            return False
        study_rescan_requested = False
        state.study_task = asyncio.create_task(run_study_reflection())
        return True

    async def run_study_watch(reply_text: str, speaker: str):
        """One check of the latest reply against the speaker's established sheet.

        Drift is only ever *reported*. Whether a reply that is not this character
        is a mistake or the moment they became someone else is exactly the
        judgement a reader is better at than a model.
        """
        try:
            await send_json({"type": "character_study_status", "busy": True})
            async with state.auxiliary_lock:
                result = await asyncio.wait_for(
                    watch_reply(state, reply_text, speaker),
                    timeout=STUDY_WATCH_TIMEOUT_SECONDS,
                )
            if result is None:
                return
            items = result["drift"]
            if items:
                state.study_alert = {"items": items, "speaker": speaker}
                logger.info(f"Character study: {len(items)} drift report(s) in the latest reply")
                await send_json({"type": "study_drift_alert", "items": items, "speaker": speaker})
            else:
                state.study_alert = None
        except asyncio.CancelledError:
            logger.info("Character study check cancelled")
            raise
        except TimeoutError:
            logger.error(f"Character study check timed out after {STUDY_WATCH_TIMEOUT_SECONDS}s")
        except Exception as e:
            logger.error(f"Character study check failed: {e}")
        finally:
            try:
                await send_json({"type": "character_study_status", "busy": False})
            except Exception:
                pass  # connection likely gone

    def schedule_study_watch(reply_text: str, speaker: str, force: bool = False) -> bool:
        """Start an adherence check in the background, at most one at a time."""
        if not state.character_study_enabled:
            return False
        if not force and not should_watch_study(state, speaker):
            return False
        if state.study_task and not state.study_task.done():
            return False
        if not reply_text.strip():
            return False
        state.study_task = asyncio.create_task(run_study_watch(reply_text, speaker))
        return True

    async def run_study_harvest():
        """Read the whole story and rebuild every character's sheet from it."""
        try:
            await send_json({"type": "character_study_status", "busy": True})
            async with state.auxiliary_lock:
                observed = await asyncio.wait_for(
                    harvest_study(state), timeout=STUDY_HARVEST_TIMEOUT_SECONDS
                )
            if not observed:
                await send_json(character_study_state_payload({"unchanged": True}))
                return
            state.studies, added = rebuild_study(state.studies, observed)
            state.studies_covered = len(conversation_messages(state))
            logger.info(
                f"Character study rebuilt from the story: {added} observation(s) read, "
                f"sheet now {len(state.studies)}"
            )
            await send_json(character_study_state_payload({"added": added, "rebuilt": True}))
        except asyncio.CancelledError:
            logger.info("Character study harvest cancelled")
            raise
        except TimeoutError:
            logger.error(
                f"Character study harvest timed out after {STUDY_HARVEST_TIMEOUT_SECONDS}s"
            )
            await send_json(character_study_state_payload({"unchanged": True}))
        except Exception as e:
            logger.error(f"Character study harvest failed: {e}")
            await send_json(character_study_state_payload({"unchanged": True}))
        finally:
            try:
                await send_json({"type": "character_study_status", "busy": False})
            except Exception:
                pass  # connection likely gone

    async def process_text_message(
        user_text: str,
        image_base64: str | None = None,
        image_explainer_model: str | None = None,
        as_narrator: bool = False,
        speaker_name: str = "",
        unprompted: bool = False,
        quiet_seconds: int = 0,
    ):
        """Process text message with optional image attachment"""
        try:
            await speak_streaming_from_llm(
                user_text,
                image_base64,
                image_explainer_model,
                as_narrator=as_narrator,
                speaker_name=speaker_name,
                unprompted=unprompted,
                quiet_seconds=quiet_seconds,
            )
        except asyncio.CancelledError:
            logger.info("Text message processing cancelled")
            raise
        except WebSocketDisconnect:
            logger.warning("WebSocket disconnected during processing")
            # Don't re-raise, just stop gracefully
        except Exception as e:
            if "disconnect" in str(e).lower() or "closed" in str(e).lower():
                logger.warning("WebSocket disconnected during processing")
            else:
                logger.error(f"Text message error: {e}")
                import traceback

                traceback.print_exc()

    async def speak_streaming_from_llm(
        user_text: str,
        image_base64: str | None = None,
        image_explainer_model: str | None = None,
        as_narrator: bool = False,
        speaker_name: str = "",
        unprompted: bool = False,
        quiet_seconds: int = 0,
    ):
        """Stream assistant response from LLM and synthesize to audio chunks.

        ``as_narrator`` marks the user turn as omniscient narration (stage
        direction) rather than the user speaking in character. ``speaker_name``,
        when set (group scenes), attributes the stored reply to that character so
        the model can keep multiple characters straight across turns.

        ``unprompted`` is an idle presence beat: the character takes a turn after
        a silence, so there is no user message at all. Everything downstream —
        streaming, TTS, control tags, memory upkeep — is deliberately identical;
        only the absent user turn and the extra directive differ.
        """
        if unprompted:
            logger.info(f"Presence beat (quiet for ~{quiet_seconds}s)")
        elif image_base64:
            logger.info(
                f"User said: {user_text[:50]}... [with image: {len(image_base64[:50])} chars]"
            )
        else:
            logger.info(f"User said: {user_text[:50]}...")

        # Build user message content. A presence beat has no user turn at all,
        # so it must not fall back to the image-less placeholder question.
        if unprompted:
            user_message_content = ""
        else:
            user_message_content = user_text if user_text else "What do you see in this image?"

        # Handle image attachment: use image explainer to describe it
        if image_base64 and engine_manager.image_explainer is not None:
            try:
                logger.info("Processing image with vision model...")

                # Extract base64 data (remove data:image/...;base64, prefix if present)
                if "," in image_base64:
                    image_data = image_base64.split(",", 1)[1]
                else:
                    image_data = image_base64

                # Decode and save image temporarily
                image_bytes = base64.b64decode(image_data)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                temp_image_path = os.path.join(config.user_images_dir, f"temp_{timestamp}.png")

                with open(temp_image_path, "wb") as f:
                    f.write(image_bytes)

                logger.info(f"Saved temporary image: {temp_image_path}")

                # Lazy load model if needed (only for local model)
                if (
                    not image_explainer_model or not image_explainer_model.startswith("ollama:")
                ) and engine_manager.image_explainer.model is None:
                    logger.info("Loading image explainer model for first use...")
                    engine_manager.image_explainer.load_model()

                # Generate description
                image_description = engine_manager.image_explainer.explain_image(
                    temp_image_path,
                    prompt=user_message_content,
                    model_id=image_explainer_model,
                )

                # Unload model in low VRAM mode
                if config.low_vram_mode:
                    engine_manager.unload_image_explainer()

                # Append description to user text
                if user_message_content:
                    user_message_content = f"{user_message_content}\n\n[The user attached an image with the following description: {image_description}]"
                else:
                    user_message_content = f"[The user attached an image with the following description: {image_description}]"

                # Send notification to client
                await send_json({"type": "image_described", "description": image_description})

            except Exception as e:
                logger.error(f"Failed to process image: {e}")
                import traceback

                traceback.print_exc()
                # Continue without image description
                if not user_message_content:
                    user_message_content = "I sent you an image, but it couldn't be processed."

        elif image_base64 and engine_manager.image_explainer is None:
            logger.warning("Image received but image explainer is not available")
            # Inform the user
            if user_message_content:
                user_message_content = f"{user_message_content}\n\n[Note: An image was attached but image explanation is not available]"
            else:
                user_message_content = (
                    "[An image was attached but image explanation is not available]"
                )

        if unprompted:
            # Nobody spoke, so nothing is appended to history. The reply is
            # generated from the story as it already stands.
            state.presence_beats += 1
        else:
            # Create text-only user message (never send images to LLM)
            user_message = {"role": "user", "content": user_message_content}

            # Only add user message if it's not already the last message in history
            if (
                not state.messages
                or state.messages[-1].get("content") != user_message_content
                or state.messages[-1].get("role") != "user"
            ):
                state.messages.append(user_message)

            # The user is back in the room: the character may speak up again.
            state.presence_beats = 0

        await send_json({"type": "assistant_start"})

        # Prepare messages for LLM. build_llm_messages assembles a fresh copy with
        # Lorebook knowledge, the Author's Note, and the Director/scene-style
        # directive injected, honoring context mode.
        llm_messages = build_llm_messages(
            state,
            no_context_user_text=None if unprompted else user_message_content,
            speaker=speaker_name,
        )
        # The Director's one-shot beat steers exactly one reply, then is cleared.
        if state.director_beat:
            logger.info(f"Director beat consumed: {state.director_beat[:80]}")
            state.director_beat = ""
            await send_json({"type": "director_beat_consumed"})
        # A continuity correction steers exactly one retry, then is cleared —
        # otherwise every later reply would keep apologising to a fixed problem.
        if state.continuity_note:
            logger.info("Continuity correction applied to this generation")
            state.continuity_note = ""
        # A leak correction is consumed the same way, for the same reason.
        if state.sightline_note:
            logger.info("Knowledge correction applied to this generation")
            state.sightline_note = ""
        # And a character correction, likewise.
        if state.study_note:
            logger.info("Character correction applied to this generation")
            state.study_note = ""

        # Narrator turns: tell the model the latest message is omniscient stage
        # direction, not the user speaking, so it reacts rather than replying to it.
        if as_narrator:
            speaker = speaker_name or state.char_name or "your character"
            narrator_user = state.user_name or "the user"
            llm_messages.append(
                {
                    "role": "system",
                    "content": (
                        f"[The most recent message is narration from an omniscient "
                        f"narrator setting the scene — not {narrator_user} speaking in "
                        f"character. Treat it as stage direction and continue the scene "
                        f"in character as {speaker}, reacting to what it establishes. Do "
                        f"not repeat or quote the narration.]"
                    ),
                }
            )

        # Idle presence: appended last so "keep it a beat, not a scene" wins over
        # the persistent length dial, and so the model cannot mistake the user's
        # last message for something it still owes an answer to.
        if unprompted:
            llm_messages.append(
                {
                    "role": "system",
                    "content": build_presence_directive(
                        state,
                        speaker_name or state.char_name,
                        state.user_name,
                        quiet_seconds=quiet_seconds,
                        beat_index=state.presence_cursor,
                    ),
                }
            )
            state.presence_cursor += 1

        # Sampling for this reply: a ceiling drawn from the Director's length
        # dial, and stop sequences so the model cannot carry on past its own turn
        # into somebody else's. The context window itself comes from the client's
        # configured defaults.
        reply_options = {
            "num_predict": reply_token_ceiling(state),
            "stop": build_stop_sequences(state, speaker_name),
        }

        # Send the JSON payload that will be sent to LLM
        llm_payload = {
            "model": state.llm_model,
            "messages": llm_messages,
            "stream": True,
            "options": {**default_chat_options(), **reply_options},
        }
        await send_json({"type": "llm_payload", "payload": llm_payload})

        full = ""
        buf = ""
        tts_engine = engine_manager.tts_engine
        assert tts_engine is not None, "TTS engine not initialized"

        # Initialize text/display filters for streamed output.
        text_filter = StreamingTextFilter()
        display_filter = StreamingHiddenTagFilter()
        # How each phrase should be *delivered*. The TTS text filter strips the
        # brackets and *action blocks* that carry the performance, so by the time
        # a phrase is ready to speak its cues are gone. This reads the unfiltered
        # stream alongside and keeps a running answer for engines that can act on
        # one; engines that cannot simply ignore the argument.
        expression = StreamingExpressionTracker()
        # A group reply is stored as "Mira: ..." so the model can track who spoke;
        # it copies that label into its own next reply, so strip it before the
        # reader ever sees it. Solo scenes have no cast to match and pay nothing.
        prefix_filter = StreamingSpeakerPrefixFilter(
            [*(state.cast or []), speaker_name or state.char_name]
        )

        # Generation stats for the UI: wall time + a chunk-based token estimate
        # (Ollama streams roughly one token per delta).
        gen_started = time.perf_counter()
        delta_count = 0
        # Filled from the stream's final frame. Ollama has always reported what a
        # request cost; the UI used to show a count of stream chunks instead, so
        # the standing context could grow for a hundred turns with nothing on
        # screen to say so.
        usage: dict = {}

        def record_usage(reported: dict) -> None:
            usage.update(reported)

        try:
            logger.info("Starting LLM streaming...")
            client = get_chat_client(state.llm_host, state.llm_model)
            async for delta in client.stream_chat(
                llm_messages,
                model=state.llm_model,
                options=reply_options,
                on_usage=record_usage,
            ):
                full += delta
                delta_count += 1

                # Filter text for TTS - only keep spoken parts (no actions/formatting)
                filtered_delta = text_filter.process(delta)
                buf += filtered_delta

                # Read delivery cues from the raw delta, before the filters above
                # discard the tags and action blocks that carry them.
                expression.process(delta)

                # Remove hidden IMAGE, SCENE, mood, and animation tags from display
                # across chunk boundaries, while keeping ordinary tags like [laugh].
                display_delta = prefix_filter.process(display_filter.process(delta))

                # Detect if IMAGE tags were present
                if re.search(r"\[IMAGE:\s*[^\]]+\]", delta, re.IGNORECASE):
                    logger.debug(f"IMAGE tag detected in: {delta[:100]}")

                if display_delta:
                    await send_json({"type": "assistant_delta", "delta": display_delta})

                ready, buf = phrase_chunker(buf)
                for phrase in ready:
                    # Remove ALL tags (including [IMAGE:...], [laugh], etc.) before TTS
                    # Redundant now if filter works perfectly, but good as a safety net for other tags
                    phrase_for_tts = re.sub(r"\[[^\]]+\]", "", phrase, flags=re.IGNORECASE)
                    clean_phrase = phrase_for_tts.strip()

                    if not clean_phrase:
                        continue

                    # Only synthesize audio if output mode is "voice"
                    if state.output_mode == "voice":
                        emotion = expression.take()
                        logger.info(f"Synthesizing ({emotion or 'plain'}): {clean_phrase}")

                        state.speaking = True
                        audio = await tts_engine.synthesize(clean_phrase, emotion=emotion)
                        logger.info(
                            f"Generated {len(audio.pcm16le)} bytes of audio at {audio.sample_rate}Hz"
                        )
                        await send_json(
                            {
                                "type": "audio_start",
                                "sample_rate": audio.sample_rate,
                                "format": "pcm16le",
                            }
                        )
                        await ws.send_bytes(audio.pcm16le)
                        await send_json({"type": "audio_end"})
                        state.speaking = False

            # Flush any delayed display text (for example a normal bracketed tag
            # that looked briefly like a hidden control tag while streaming).
            display_tail = prefix_filter.process(display_filter.flush()) + prefix_filter.flush()
            if display_tail:
                await send_json({"type": "assistant_delta", "delta": display_tail})

            # flush remaining buffer

            # Use filter flush to get any remaining valid text
            final_filtered_chunk = text_filter.flush()
            buf += final_filtered_chunk

            # logger.info(f"LLM complete. Full response: {full}")
            logger.debug(f"Remaining TTS buffer: {buf}")

            if buf.strip():
                # Remove ALL tags (including [IMAGE:...], [laugh], etc.) before TTS
                buf_for_tts = re.sub(r"\[[^\]]+\]", "", buf, flags=re.IGNORECASE)
                clean_buf = buf_for_tts.strip()

                if clean_buf:
                    # Only synthesize audio if output mode is "voice"
                    if state.output_mode == "voice":
                        emotion = expression.take()
                        logger.info(f"Synthesizing final phrase ({emotion or 'plain'}): {clean_buf}")
                        state.speaking = True
                        audio = await tts_engine.synthesize(clean_buf, emotion=emotion)
                        logger.info(
                            f"Generated {len(audio.pcm16le)} bytes of audio at {audio.sample_rate}Hz"
                        )
                        await send_json(
                            {
                                "type": "audio_start",
                                "sample_rate": audio.sample_rate,
                                "format": "pcm16le",
                            }
                        )
                        await ws.send_bytes(audio.pcm16le)
                        await send_json({"type": "audio_end"})
                        state.speaking = False

            # Check for image generation requests in the full response
            if engine_manager.image_generator is not None:
                image_requests = re.findall(r"\[IMAGE:\s*([^\]]+)\]", full, re.IGNORECASE)

                if image_requests:
                    # Initialize image generator if not already done (lazy loading)
                    if not engine_manager.image_generator._initialized:
                        logger.info("Initializing image generator...")
                        engine_manager.image_generator.initialize()

                    # Update character description if provided
                    if state.character_description:
                        engine_manager.image_generator.set_character_description(
                            state.character_description
                        )

                    # Generate images for each request
                    for img_prompt_raw in image_requests:
                        # Use LLM to optimize the prompt to be concise (under 40 words)
                        logger.info("Optimizing image prompt...")
                        optimization_messages = build_image_prompt_messages(img_prompt_raw)

                        optimized_prompt = ""
                        client = get_chat_client(state.llm_host, state.llm_model)
                        async for delta in client.stream_chat(
                            optimization_messages,
                            model=state.llm_model,
                            think=False,
                            # At most 40 words is the whole contract for this task.
                            options={"num_predict": 1000},
                        ):
                            optimized_prompt += delta

                        img_prompt = optimized_prompt.strip()
                        logger.info(f"Optimized: {img_prompt_raw[:50]}... -> {img_prompt}")

                        await send_json({"type": "image_generating", "prompt": img_prompt})

                        try:
                            # Generate the image
                            image = await engine_manager.image_generator.generate(
                                scene_prompt=img_prompt.strip(),
                                include_character=bool(state.character_description),
                                num_inference_steps=config.imagegen_steps,
                                guidance_scale=config.imagegen_guidance,
                                width=config.imagegen_width,
                                height=config.imagegen_height,
                            )

                            # Save image to user_data/images directory
                            save_image_to_disk(image, img_prompt.strip(), config.user_images_dir)

                            # Convert to base64 for transmission
                            img_base64 = image_to_base64(image)

                            # Send the image to frontend
                            await send_json(
                                {
                                    "type": "image_generated",
                                    "image": img_base64,
                                    "prompt": img_prompt.strip(),
                                    "format": "png",
                                }
                            )
                            logger.info(f"Image sent to client ({len(img_base64)} bytes)")

                            # Unload model in low VRAM mode
                            if config.low_vram_mode:
                                engine_manager.unload_image_generator()

                        except Exception as e:
                            logger.error(f"Image generation failed: {e}")
                            import traceback

                            traceback.print_exc()
                            await send_json(
                                {
                                    "type": "image_error",
                                    "error": str(e),
                                    "prompt": img_prompt.strip(),
                                }
                            )

            # Auto-scene: apply any [SCENE: ...] tags the character emitted to
            # advance the setting, then tell the UI so the scene bar & ambient
            # backdrop update. Only honored when the toggle is on.
            if state.auto_scene:
                scene_changed = False
                for scene_body in SCENE_TAG_RE.findall(full):
                    updates = parse_scene_tag(scene_body)
                    if not updates:
                        continue
                    if "time" in updates:
                        state.scene_time = updates["time"]
                    if "weather" in updates:
                        state.scene_weather = updates["weather"]
                    if "location" in updates:
                        state.scene_location = updates["location"]
                    scene_changed = True
                if scene_changed:
                    logger.info(
                        f"Auto-scene → time={state.scene_time or '-'}, "
                        f"weather={state.scene_weather or '-'}, "
                        f"location={state.scene_location[:60] or '-'}"
                    )
                    await send_json(
                        {
                            "type": "scene_updated",
                            "time": state.scene_time,
                            "weather": state.scene_weather,
                            "location": state.scene_location,
                        }
                    )

            # Extract the character's current mood (if any) for the UI, then strip
            # the tag so it never lingers in the stored history or display.
            mood_match = MOOD_TAG_RE.search(full)
            if mood_match:
                mood = mood_match.group(1).strip()
                logger.info(f"Character mood: {mood}")
                await send_json({"type": "mood", "mood": mood})

            stored_full = MOOD_TAG_RE.sub("", full)
            stored_full = strip_animation_tags(stored_full)
            stored_full = SCENE_TAG_RE.sub("", stored_full).strip()
            # The same label the reader was spared must not survive into the
            # history either, or the next turn learns the habit from this one.
            stored_full = strip_speaker_prefix(
                stored_full, [*(state.cast or []), speaker_name or state.char_name]
            )

            animation_body = find_animation_tag_body(full)
            if state.include_animation and animation_body:
                directive = parse_animation_tag(animation_body)
                if speaker_name:
                    directive["speaker"] = speaker_name
                logger.info(f"Stage animation: {directive}")
                await send_json({"type": "animation_directive", "directive": directive})
            elif state.include_animation:
                logger.info(
                    "Animation mode enabled, but no ANIM/POSE/ACTION tag found; "
                    "asking LLM for a rig motion plan"
                )
                try:
                    directive = await generate_animation_directive_from_reply(
                        stored_full,
                        llm_host=state.llm_host,
                        llm_model=state.llm_model,
                        character_name=speaker_name or state.char_name,
                        user_name=state.user_name,
                    )
                    if directive:
                        if speaker_name:
                            directive["speaker"] = speaker_name
                        logger.info(f"Stage animation fallback: {directive}")
                        await send_json({"type": "animation_directive", "directive": directive})
                    else:
                        logger.info("Animation fallback produced no usable rig motion")
                except Exception as e:
                    logger.warning(f"Animation fallback failed: {e}")

            # In group scenes, keep the reply attributed to its speaker in the
            # backend history so the model can track who said what next turn.
            # (The visible/streamed text stays clean; the UI adds the name badge.)
            content_to_store = f"{speaker_name}: {stored_full}" if speaker_name else stored_full
            state.messages.append({"role": "assistant", "content": content_to_store})
            elapsed_ms = int((time.perf_counter() - gen_started) * 1000)
            await send_json(
                {
                    "type": "assistant_end",
                    "elapsed_ms": elapsed_ms,
                    # Kept for older clients, and as the fallback for a server
                    # that reported no accounting at all.
                    "approx_tokens": delta_count,
                    **({"usage": usage} if usage else {}),
                }
            )
            if usage:
                logger.info(
                    f"Assistant response complete in {elapsed_ms} ms — "
                    f"{usage['prompt_tokens']} prompt + {usage['completion_tokens']} "
                    f"generated tokens of {usage['context_limit'] or '?'} context"
                )
            else:
                logger.info(
                    f"Assistant response complete ({delta_count} chunks in {elapsed_ms} ms)"
                )

            # Story Memory upkeep runs after the reply is already on screen, so
            # the summarization pass never shows up as reply latency.
            if schedule_memory_update():
                logger.info(f"Story memory pass queued ({pending_count(state)} turns pending)")

            # The Continuity Guard reads the reply the user is already looking at,
            # for the same reason: a check the story waits on is a check nobody
            # would leave switched on.
            if schedule_continuity_check(stored_full):
                logger.info("Continuity check queued for the latest reply")

            # Sightlines reads the same reply for knowledge its speaker should not
            # have had. It only spends a pass when something is actually being
            # withheld from someone, so an ordinary scene never pays for it.
            if schedule_sightlines_check(stored_full, speaker_name or state.char_name):
                logger.info("Sightlines check queued for the latest reply")

            # The Character Study watches the reply for a character who is not
            # themselves. Only ever when the speaker has a sheet to be measured
            # against, so a new story pays nothing for this being available.
            if schedule_study_watch(stored_full, speaker_name or state.char_name):
                logger.info("Character study check queued for the latest reply")
            # …and otherwise, once enough turns have piled up, reads them for what
            # the cast has become. Batched rather than per-reply: people do not
            # change every turn, so paying for a pass every turn buys only latency.
            elif schedule_study_reflection():
                logger.info(
                    f"Character study pass queued ({study_pending_count(state)} turns pending)"
                )

            # Story Threads reads the newly completed turn after it is visible.
            # Its worker coalesces if another turn arrives before this pass wins
            # the shared auxiliary-model lock.
            if schedule_story_threads_update():
                history = conversation_messages(state)
                covered = story_thread_cursor(state, len(history))
                logger.info(f"Story thread pass queued ({len(history) - covered} messages pending)")
        except asyncio.CancelledError:
            logger.info("LLM streaming cancelled by user")
            state.speaking = False
            try:
                await send_json({"type": "assistant_cancelled"})
            except Exception:
                pass  # Connection likely closed
            raise
        except WebSocketDisconnect:
            logger.warning("WebSocket disconnected during LLM streaming")
            state.speaking = False
            # Don't re-raise, connection is gone
        except Exception as e:
            if "disconnect" in str(e).lower() or "closed" in str(e).lower():
                logger.warning("WebSocket disconnected during LLM streaming")
                state.speaking = False
            else:
                logger.error(f"Error in speak_streaming_from_llm: {e}")
                import traceback

                traceback.print_exc()
                state.speaking = False
                try:
                    await send_json({"type": "error", "message": str(e)})
                except Exception:
                    pass  # Connection likely already closed

    async def handle_set_system_prompt(data: dict):
        """Handle system prompt update"""
        raw_content = data.get("content", DEFAULT_ROLEPLAY_PROMPT)
        base_content = raw_content if isinstance(raw_content, str) else DEFAULT_ROLEPLAY_PROMPT

        # Capture the character/user names so {{char}} / {{user}} macros (and the
        # Director directives) expand correctly across the whole conversation.
        char_name = str(data.get("char", "") or "").strip()
        user_name = str(data.get("user", "") or "").strip()
        if char_name:
            state.char_name = char_name
        if user_name:
            state.user_name = user_name

        # Let set_system_prompt carry the prompt feature flags too. This keeps
        # frontend visual state and backend prompt instructions in sync even when
        # the app swaps system prompts per speaker.
        if "include_animation" in data:
            state.include_animation = bool(data.get("include_animation"))
        if "include_mood" in data:
            state.include_mood = bool(data.get("include_mood"))
        if "auto_scene" in data:
            state.auto_scene = bool(data.get("auto_scene"))
        if "include_imagegen" in data:
            state.include_imagegen = bool(data.get("include_imagegen"))
        if "adult_mode" in data:
            state.adult_mode = bool(data.get("adult_mode"))

        # Extract character description if present (for image generation)
        # Look for ### Character Description section
        char_desc_match = re.search(
            r"### Character Description\s*\n(.+?)(?:\n###|\Z)", base_content, re.DOTALL
        )
        if char_desc_match and engine_manager.image_generator is not None:
            state.character_description = char_desc_match.group(1).strip()
            logger.info(
                f"Character description extracted for image generation: {state.character_description[:100]}..."
            )

        system_content = build_chat_system_prompt(
            base_content,
            image_generation=engine_manager.image_generator is not None and state.include_imagegen,
            auto_scene=state.auto_scene,
            mood=state.include_mood,
            animation=state.include_animation,
            adult_mode=state.adult_mode,
        )

        # Expand {{char}} / {{user}} macros now so the stored system prompt (and
        # everything derived from it) reads with real names instead of literals.
        system_content = apply_placeholders(system_content, state.char_name, state.user_name)

        # Ensure we always have exactly one system message at the start
        state.messages = [m for m in state.messages if m["role"] != "system"]
        state.messages.insert(0, {"role": "system", "content": system_content})

        logger.info(
            f"System prompt updated (engine: {state.tts_engine_type}, "
            f"animation={'on' if state.include_animation else 'off'}, "
            f"mood={'on' if state.include_mood else 'off'}, "
            f"auto_scene={'on' if state.auto_scene else 'off'}, "
            f"adult_mode={'on' if state.adult_mode else 'off'}): "
            f"{system_content[:150]}..."
        )
        await send_json({"type": "ack", "system_prompt_updated": True})

    async def handle_set_tts_engine(data: dict[str, str]):
        """Handle TTS engine switch - supports Piper, Chatterbox, and Soprano"""
        engine = str(data.get("engine", "piper")).lower()
        logger.info(f"Switching TTS engine to: {engine}")

        try:
            # Use the engine manager's switch method
            success, message = engine_manager.switch_tts_engine(engine)

            if success:
                # Note: deliberately leave the system prompt untouched — switching
                # the voice engine must never reset the roleplay context.
                state.tts_engine_type = engine
                logger.info(f"✅ {message}")
                await send_json(
                    {"type": "tts_engine_changed", "tts_engine": engine, "message": message}
                )
            else:
                logger.error(f"❌ {message}")
                await send_json({"type": "error", "message": message})
        except Exception as e:
            logger.error(f"Failed to switch TTS engine: {e}")
            import traceback

            traceback.print_exc()
            await send_json({"type": "error", "message": f"Failed to switch TTS: {str(e)}"})

    try:
        stt_engine = engine_manager.stt_engine
        tts_engine = engine_manager.tts_engine

        assert stt_engine is not None, "STT engine not initialized"
        assert tts_engine is not None, "TTS engine not initialized"

        while True:
            msg = await ws.receive()
            if "text" in msg and msg["text"]:
                data = json.loads(msg["text"])
                mtype = data.get("type")

                if mtype == "set_system_prompt":
                    await handle_set_system_prompt(data)

                elif mtype == "clear_chat":
                    system_msgs = [m for m in state.messages if m["role"] == "system"]
                    await cancel_story_threads(state)
                    state.messages = system_msgs
                    # The running memory describes a story that no longer exists,
                    # and so do its canon, unresolved threads, and sightlines —
                    # along with everything the cast had become in it.
                    await cancel_memory(state)
                    reset_memory(state)
                    await cancel_continuity(state)
                    reset_canon(state)
                    reset_story_threads(state)
                    await cancel_sightlines(state)
                    reset_sightlines(state)
                    await cancel_character_study(state)
                    reset_study(state)
                    state.presence_beats = 0
                    logger.info("Chat history cleared")
                    await send_json({"type": "chat_cleared"})
                    await send_json(memory_state_payload())
                    await send_json(canon_state_payload())
                    await send_json(story_threads_state_payload())
                    await send_json(sightlines_state_payload())
                    await send_json(character_study_state_payload())

                elif mtype == "wipe_all":
                    # Nuke everything: cancel any work, reset this connection's
                    # conversation + roleplay context, and erase on-disk user data
                    # (images, uploaded characters, and logs) so no trace remains.
                    ws_origin = (ws.headers.get("origin") or "").strip()
                    if ws_origin and not _wipe_origin_allowed(
                        ws_origin, ws.headers.get("host", "")
                    ):
                        logger.warning(f"Rejected wipe_all from disallowed origin: {ws_origin}")
                        await send_json(
                            {"type": "error", "message": "wipe_all rejected: disallowed origin"}
                        )
                    else:
                        logger.info("Wipe-all requested — clearing conversation and on-disk data")
                        await wipe_connection_state(state)
                        try:
                            summary = wipe_user_data(clear_logs=True)
                            logger.info(f"Wipe-all complete: {summary}")
                        except Exception as e:
                            logger.error(f"Wipe-all disk cleanup failed: {e}")
                            summary = {"error": str(e)}
                        await send_json(memory_state_payload())
                        await send_json(canon_state_payload())
                        await send_json(story_threads_state_payload())
                        await send_json(sightlines_state_payload())
                        await send_json({"type": "wiped_all", "summary": summary})

                elif mtype == "sync_history":
                    history = data.get("history", [])
                    system_msgs = [m for m in state.messages if m["role"] == "system"]
                    # A scan against the old transcript must never land on top of
                    # an edit, rewind, session load, or reconnect restore.
                    await cancel_story_threads(state)
                    state.messages = system_msgs + history
                    # Edits, rewinds, and deletions move the ground under the
                    # memory cursor; keep it inside the story it indexes. The
                    # summary itself is left alone — rewinding past it is rare,
                    # and the UI offers a rebuild for when it happens.
                    state.memory_covered = min(state.memory_covered, len(history))
                    # A rewrite of the story is the user taking the wheel; the
                    # character's unprompted allowance starts over with it, and a
                    # contradiction reported against a line that may no longer be
                    # there is retracted rather than left hanging over the story.
                    state.presence_beats = 0
                    state.continuity_alert = None
                    state.canon_covered = min(state.canon_covered, len(history))
                    # A leak reported against a passage that may no longer exist is
                    # retracted rather than left hanging over the story. The ledger
                    # itself survives: unlike a derived thread, who knows what is
                    # largely the user's own dramatic decision, and rewinding a
                    # scene does not unmake it.
                    await cancel_sightlines(state)
                    state.sightline_alert = None
                    state.sightline_note = ""
                    state.sightlines_covered = min(state.sightlines_covered, len(history))
                    # Any indexed passage may have been deleted. Derived threads
                    # cannot prove their own removal during incremental catch-up,
                    # so discard them rather than inject stale possibilities into
                    # the next reply. Explicitly pinned reader intent survives.
                    state.story_threads = [
                        thread
                        for thread in normalize_story_threads(state.story_threads)
                        if thread.get("pinned")
                    ]
                    state.story_threads_covered = 0
                    logger.info(f"History synced: {len(history)} messages")
                    await send_json({"type": "ack", "history_synced": True})
                    await send_json(story_threads_state_payload())

                elif mtype == "set_context_mode":
                    state.use_context = data.get("enabled", True)
                    logger.info(f"Context mode: {'enabled' if state.use_context else 'disabled'}")
                    await send_json({"type": "ack", "use_context": state.use_context})

                elif mtype == "set_imagegen_mode":
                    state.include_imagegen = data.get("enabled", True)
                    logger.info(
                        f"ImageGen mode: {'enabled' if state.include_imagegen else 'disabled'}"
                    )
                    await send_json({"type": "ack", "include_imagegen": state.include_imagegen})

                elif mtype == "set_lorebook":
                    entries = data.get("entries", [])
                    if isinstance(entries, list):
                        state.lorebook = entries
                    scan_depth = data.get("scan_depth")
                    if isinstance(scan_depth, int) and scan_depth > 0:
                        state.lorebook_scan_depth = scan_depth
                    enabled_count = sum(1 for e in state.lorebook if e.get("enabled", True))
                    logger.info(
                        f"Lorebook updated: {len(state.lorebook)} entries "
                        f"({enabled_count} enabled), scan depth {state.lorebook_scan_depth}"
                    )
                    await send_json({"type": "ack", "lorebook_entries": len(state.lorebook)})

                elif mtype == "set_author_note":
                    state.author_note = str(data.get("note", "") or "")
                    depth = data.get("depth")
                    if isinstance(depth, int) and depth >= 0:
                        state.author_note_depth = depth
                    logger.info(
                        f"Author's note set ({len(state.author_note)} chars, "
                        f"depth {state.author_note_depth})"
                    )
                    await send_json({"type": "ack", "author_note_set": True})

                elif mtype == "set_memory":
                    # Story Memory settings, plus the restored record when a saved
                    # story (or a reconnecting browser) brings its own memory back.
                    if "enabled" in data:
                        state.memory_enabled = bool(data.get("enabled"))
                    if "auto" in data:
                        state.memory_auto = bool(data.get("auto"))
                    keep = data.get("keep_recent")
                    if isinstance(keep, int):
                        state.memory_keep_recent = max(MIN_KEEP_RECENT, min(MAX_KEEP_RECENT, keep))
                    trigger = data.get("trigger")
                    if isinstance(trigger, int):
                        state.memory_trigger = max(MIN_TRIGGER, min(MAX_TRIGGER, trigger))
                    if "summary" in data:
                        state.memory_summary = str(data.get("summary") or "")[:MAX_SUMMARY_CHARS]
                    if isinstance(data.get("covered"), int):
                        state.memory_covered = max(0, int(data["covered"]))
                    logger.info(
                        f"Story memory: {'on' if state.memory_enabled else 'off'}, "
                        f"auto={'on' if state.memory_auto else 'off'}, "
                        f"keep={state.memory_keep_recent}, trigger={state.memory_trigger}, "
                        f"record={len(state.memory_summary)} chars covering "
                        f"{state.memory_covered} messages"
                    )
                    await send_json(memory_state_payload())

                elif mtype == "summarize_memory":
                    # "Remember now" — an explicit pass, even below the threshold.
                    if not state.memory_enabled:
                        await send_json(memory_state_payload({"unchanged": True}))
                    elif not schedule_memory_update(force=True):
                        logger.info("Story memory pass already running; ignoring request")

                elif mtype == "forget_memory":
                    await cancel_memory(state)
                    reset_memory(state)
                    logger.info("Story memory cleared by user")
                    await send_json(memory_state_payload())

                elif mtype == "set_continuity":
                    # Continuity Guard settings, plus the restored ledger when a
                    # saved story (or a reconnecting browser) brings its canon back.
                    if "enabled" in data:
                        state.continuity_enabled = bool(data.get("enabled"))
                        if not state.continuity_enabled:
                            # Nothing half-flagged survives switching the guard off.
                            await cancel_continuity(state)
                            state.continuity_alert = None
                            state.continuity_note = ""
                    if "auto" in data:
                        state.continuity_auto = bool(data.get("auto"))
                    if "facts" in data:
                        state.canon = normalize_facts(data.get("facts"))
                    if isinstance(data.get("covered"), int):
                        state.canon_covered = max(0, int(data["covered"]))
                    logger.info(
                        f"Continuity guard: {'on' if state.continuity_enabled else 'off'}, "
                        f"auto={'on' if state.continuity_auto else 'off'}, "
                        f"{len(state.canon)} fact(s) in canon"
                    )
                    await send_json(canon_state_payload())

                elif mtype == "check_continuity":
                    # "Check now" — read the latest reply against the canon even
                    # when automatic checking is off.
                    last_reply = next(
                        (
                            m.get("content", "")
                            for m in reversed(state.messages)
                            if m.get("role") == "assistant"
                        ),
                        "",
                    )
                    if not state.continuity_enabled:
                        await send_json(canon_state_payload({"unchanged": True}))
                    elif not schedule_continuity_check(last_reply, force=True):
                        logger.info("Continuity check already running (or nothing to check)")

                elif mtype == "harvest_canon":
                    # "Read the story" — build the ledger from the whole transcript,
                    # so the guard can be adopted forty turns in.
                    if not state.continuity_enabled:
                        await send_json(canon_state_payload({"unchanged": True}))
                    elif state.continuity_task and not state.continuity_task.done():
                        logger.info("Continuity pass already running; ignoring harvest request")
                    else:
                        state.continuity_task = asyncio.create_task(run_canon_harvest())

                elif mtype == "set_canon":
                    # The ledger edited by hand: a corrected line, a pin, a deletion.
                    state.canon = normalize_facts(data.get("facts"))
                    logger.info(f"Canon edited by user: {len(state.canon)} fact(s)")
                    await send_json(canon_state_payload())

                elif mtype == "add_canon_fact":
                    text = str(data.get("text", "") or "").strip()
                    if text:
                        fact = new_fact(
                            text,
                            subject=str(data.get("subject", "") or ""),
                            turn=len(conversation_messages(state)),
                            pinned=bool(data.get("pinned", True)),
                        )
                        state.canon, _ = merge_facts(state.canon, [fact])
                        logger.info(f"Canon fact added by user: {text[:80]}")
                    await send_json(canon_state_payload())

                elif mtype == "forget_canon":
                    await cancel_continuity(state)
                    reset_canon(state)
                    logger.info("Canon cleared by user")
                    await send_json(canon_state_payload())

                elif mtype == "set_story_threads":
                    # Settings and a restored session snapshot share one message,
                    # mirroring Story Memory and Continuity Guard. Cancel first so
                    # an older scan cannot overwrite the restored ledger.
                    await cancel_story_threads(state)
                    restoring_snapshot = "threads" in data or "covered" in data
                    if "enabled" in data:
                        state.story_threads_enabled = bool(data.get("enabled"))
                    if "auto" in data:
                        state.story_threads_auto = bool(data.get("auto"))
                    if "threads" in data:
                        state.story_threads = normalize_story_threads(data.get("threads"))
                    if isinstance(data.get("covered"), int):
                        history_len = len(conversation_messages(state))
                        state.story_threads_covered = max(0, min(int(data["covered"]), history_len))
                    logger.info(
                        f"Story threads: {'on' if state.story_threads_enabled else 'off'}, "
                        f"auto={'on' if state.story_threads_auto else 'off'}, "
                        f"{len(state.story_threads)} saved, covering "
                        f"{state.story_threads_covered} messages"
                    )
                    await send_json(story_threads_state_payload())
                    # Enabling tracking can catch up immediately. A reconnect or
                    # session restore waits for the next reply/manual scan instead:
                    # the remaining socket settings (notably model/host) may still
                    # be in flight behind this message.
                    if not restoring_snapshot and schedule_story_threads_update():
                        logger.info("Story thread catch-up queued after tracking was enabled")

                elif mtype == "set_threads":
                    # Direct edits (title, summary, status, pin, deletion) are
                    # authoritative user choices.
                    await cancel_story_threads(state)
                    state.story_threads = normalize_story_threads(data.get("threads"))
                    logger.info(
                        f"Story thread ledger edited by user: {len(state.story_threads)} thread(s)"
                    )
                    await send_json(story_threads_state_payload())

                elif mtype == "add_story_thread":
                    await cancel_story_threads(state)
                    existing = normalize_story_threads(state.story_threads)
                    thread = new_story_thread(
                        str(data.get("title", "") or ""),
                        str(data.get("summary", "") or ""),
                        kind=str(data.get("kind", "other") or "other"),
                        pinned=bool(data.get("pinned", True)),
                        created_turn=len(conversation_messages(state)),
                    )
                    state.story_threads = normalize_story_threads([*existing, thread])
                    added = int(len(state.story_threads) > len(existing))
                    if added:
                        logger.info(f"Story thread added by user: {thread['title'][:80]}")
                    await send_json(
                        story_threads_state_payload(
                            {"added": added, **({"unchanged": True} if not added else {})}
                        )
                    )

                elif mtype == "refresh_story_threads":
                    # Scan only uncovered turns by default; ``rebuild`` asks for
                    # one evidence-backed reading of the whole story.
                    rebuild = bool(data.get("rebuild", False))
                    if not state.story_threads_enabled:
                        await send_json(story_threads_state_payload({"unchanged": True}))
                        await send_json({"type": "story_threads_status", "busy": False})
                    elif not schedule_story_threads_update(force=True, rebuild=rebuild):
                        logger.info("Story thread pass already running; ignoring refresh request")

                elif mtype == "forget_story_threads":
                    await cancel_story_threads(state)
                    reset_story_threads(state)
                    logger.info("Story threads cleared by user")
                    await send_json(story_threads_state_payload())

                elif mtype == "set_cast":
                    # The in-scene cast. The roster lives in the browser; the
                    # backend needs the names so Sightlines can tell who is being
                    # kept out of what, and so a model can never invent a knower.
                    names = data.get("names")
                    state.cast = [
                        name.strip()
                        for name in (names if isinstance(names, list) else [])
                        if isinstance(name, str) and name.strip()
                    ]
                    logger.info(
                        f"Cast in scene: {', '.join(state.cast) if state.cast else '(solo)'}"
                    )
                    await send_json(sightlines_state_payload())
                    # The study is scoped to the cast the same way, and its card
                    # needs the same list to know who a sheet may be about.
                    await send_json(character_study_state_payload())

                elif mtype == "set_sightlines":
                    # Settings, plus the restored ledger when a saved story (or a
                    # reconnecting browser) brings its sightlines back.
                    if "enabled" in data:
                        state.sightlines_enabled = bool(data.get("enabled"))
                        if not state.sightlines_enabled:
                            # Nothing half-flagged survives switching it off.
                            await cancel_sightlines(state)
                            state.sightline_alert = None
                            state.sightline_note = ""
                    if "auto" in data:
                        state.sightlines_auto = bool(data.get("auto"))
                    if "entries" in data:
                        state.sightlines = normalize_sightline_entries(data.get("entries"))
                    if isinstance(data.get("covered"), int):
                        state.sightlines_covered = max(0, int(data["covered"]))
                    logger.info(
                        f"Sightlines: {'on' if state.sightlines_enabled else 'off'}, "
                        f"auto={'on' if state.sightlines_auto else 'off'}, "
                        f"{len(state.sightlines)} entr(ies)"
                    )
                    await send_json(sightlines_state_payload())

                elif mtype == "set_sightline_entries":
                    # The ledger edited by hand: a reworded secret, a changed
                    # audience, a pin, a deletion.
                    state.sightlines = normalize_sightline_entries(data.get("entries"))
                    logger.info(f"Sightlines edited by user: {len(state.sightlines)} entr(ies)")
                    await send_json(sightlines_state_payload())

                elif mtype == "add_sightline":
                    text = str(data.get("text", "") or "").strip()
                    if text:
                        everyone = sightline_participants(state)
                        raw_knows = data.get("knows")
                        entry = new_sightline_entry(
                            text,
                            topic=str(data.get("topic", "") or ""),
                            # An audience the UI does not supply defaults to the
                            # whole room: a new entry starts out as ordinary shared
                            # context, and becomes a secret only when the user says
                            # who is being kept out of it. A user-supplied audience
                            # is *not* narrowed to the current scene — a cast member
                            # who steps out for a scene must not silently forget
                            # what they were told. Only the model is held to the
                            # participant list, in ``parse_learned`` and friends.
                            knows=raw_knows if isinstance(raw_knows, list) else everyone,
                            turn=len(conversation_messages(state)),
                            pinned=bool(data.get("pinned", True)),
                        )
                        state.sightlines, _ = merge_sightline_entries(state.sightlines, [entry])
                        logger.info(f"Sightline added by user: {text[:80]}")
                    await send_json(sightlines_state_payload())

                elif mtype == "harvest_sightlines":
                    # "Read the story" — map who knows what from the whole
                    # transcript, so Sightlines can be adopted forty turns in.
                    if not state.sightlines_enabled:
                        await send_json(sightlines_state_payload({"unchanged": True}))
                    elif state.sightlines_task and not state.sightlines_task.done():
                        logger.info("Sightlines pass already running; ignoring harvest request")
                    else:
                        state.sightlines_task = asyncio.create_task(run_sightlines_harvest())

                elif mtype == "check_sightlines":
                    # "Check now" — read the latest reply even when automatic
                    # checking is off.
                    last_reply = next(
                        (
                            m.get("content", "")
                            for m in reversed(state.messages)
                            if m.get("role") == "assistant"
                        ),
                        "",
                    )
                    # A stored group reply carries its speaker as a "Name: " prefix.
                    speaker = str(data.get("speaker_name", "") or "").strip()
                    if not speaker and ":" in last_reply[:60]:
                        candidate = last_reply.split(":", 1)[0].strip()
                        if any(candidate.casefold() == c.casefold() for c in state.cast):
                            speaker = candidate
                    if not state.sightlines_enabled:
                        await send_json(sightlines_state_payload({"unchanged": True}))
                    elif not schedule_sightlines_check(
                        last_reply, speaker or state.char_name, force=True
                    ):
                        logger.info("Sightlines check already running (or nothing to check)")

                elif mtype == "forget_sightlines":
                    await cancel_sightlines(state)
                    reset_sightlines(state)
                    logger.info("Sightlines cleared by user")
                    await send_json(sightlines_state_payload())

                elif mtype == "resolve_sightline":
                    # What the user decided about a reported leak. Sightlines
                    # reports; this is where the story actually changes.
                    action = str(data.get("action", "") or "").strip().lower()
                    alert = state.sightline_alert or {}
                    items = alert.get("items", [])
                    speaker = alert.get("speaker", "") or state.char_name

                    if action == "reroll":
                        # Arm the correction; the UI then regenerates the reply as
                        # an ordinary swipe, and the note is consumed by that turn.
                        state.sightline_note = build_leak_note(items, state.user_name)
                    elif action == "accept":
                        # "They know it now": the reply stands, and the ledger is
                        # widened to make it true rather than left contradicting it.
                        granted = 0
                        for item in items:
                            if grant_knowledge(state, item.get("entry_id", ""), speaker):
                                granted += 1
                        logger.info(
                            f"Sightlines widened to match the latest reply ({granted} entr(ies))"
                        )
                        await send_json(sightlines_state_payload())

                    state.sightline_alert = None
                    await send_json({"type": "sightline_resolved", "action": action or "dismiss"})

                elif mtype == "set_character_study":
                    # Settings, plus the restored sheets when a saved story (or a
                    # reconnecting browser) brings its studies back.
                    restoring_snapshot = "traits" in data or "covered" in data
                    if "enabled" in data:
                        state.character_study_enabled = bool(data.get("enabled"))
                        if not state.character_study_enabled:
                            # Nothing half-flagged survives switching it off.
                            await cancel_character_study(state)
                            state.study_alert = None
                            state.study_note = ""
                    if "auto" in data:
                        state.character_study_auto = bool(data.get("auto"))
                    if "watch" in data:
                        state.character_study_watch = bool(data.get("watch"))
                    if isinstance(data.get("interval"), int):
                        state.study_interval = int(data["interval"])
                    if "traits" in data:
                        await cancel_character_study(state)
                        state.studies = normalize_traits(data.get("traits"))
                    if "locked" in data:
                        names = data.get("locked")
                        state.study_locked = [
                            name.strip()
                            for name in (names if isinstance(names, list) else [])
                            if isinstance(name, str) and name.strip()
                        ]
                    if isinstance(data.get("covered"), int):
                        history_len = len(conversation_messages(state))
                        state.studies_covered = max(0, min(int(data["covered"]), history_len))
                    logger.info(
                        f"Character study: {'on' if state.character_study_enabled else 'off'}, "
                        f"auto={'on' if state.character_study_auto else 'off'}, "
                        f"watch={'on' if state.character_study_watch else 'off'}, "
                        f"{len(state.studies)} observation(s) covering "
                        f"{state.studies_covered} messages"
                    )
                    await send_json(character_study_state_payload())
                    # Switching the learning half on can catch up immediately. A
                    # reconnect or session restore waits for the next reply
                    # instead: the remaining socket settings (notably model and
                    # host) may still be in flight behind this message.
                    if not restoring_snapshot and schedule_study_reflection():
                        logger.info("Character study catch-up queued after it was enabled")

                elif mtype == "set_study_traits":
                    # The sheet edited by hand: a reworded observation, a pin, a
                    # deletion. Always authoritative — this is the author talking.
                    await cancel_character_study(state)
                    state.studies = normalize_traits(data.get("traits"))
                    logger.info(
                        f"Character study edited by user: {len(state.studies)} observation(s)"
                    )
                    await send_json(character_study_state_payload())

                elif mtype == "add_study_trait":
                    text = str(data.get("text", "") or "").strip()
                    character = str(data.get("character", "") or "").strip()
                    if text and character:
                        trait = new_trait(
                            text,
                            character=character,
                            facet=str(data.get("facet", "manner") or "manner"),
                            about=str(data.get("about", "") or ""),
                            turn=len(conversation_messages(state)),
                            # An observation the user wrote is not a guess waiting
                            # for a second sighting: it shapes replies at once, and
                            # nothing automatic may revise it.
                            origin="authored",
                            pinned=bool(data.get("pinned", True)),
                        )
                        state.studies, added, _ = merge_observations(
                            state.studies, [trait], turn=trait["last_turn"]
                        )
                        if added:
                            logger.info(
                                f"Character study line added by user for {character}: {text[:80]}"
                            )
                    await send_json(character_study_state_payload())

                elif mtype == "set_study_lock":
                    # "This portrait is finished." The sheet keeps shaping replies;
                    # nothing automatic may add to or revise it.
                    name = str(data.get("character", "") or "").strip()
                    if name and set_lock(state, name, bool(data.get("locked"))):
                        logger.info(
                            f"Character study for {name} "
                            f"{'locked' if is_locked(state, name) else 'unlocked'}"
                        )
                    await send_json(character_study_state_payload())

                elif mtype == "refresh_character_study":
                    # "Read the story" — rebuild every sheet from the whole
                    # transcript, so the study can be adopted two hundred turns in.
                    # Without ``rebuild`` this is just "catch up now".
                    rebuild = bool(data.get("rebuild", False))
                    if not state.character_study_enabled:
                        await send_json(character_study_state_payload({"unchanged": True}))
                        await send_json({"type": "character_study_status", "busy": False})
                    elif state.study_task and not state.study_task.done():
                        logger.info("Character study pass already running; ignoring refresh")
                    elif rebuild:
                        state.study_task = asyncio.create_task(run_study_harvest())
                    elif not schedule_study_reflection(force=True):
                        await send_json(character_study_state_payload({"unchanged": True}))
                        await send_json({"type": "character_study_status", "busy": False})

                elif mtype == "check_character_study":
                    # "Check this reply now" — read the latest reply even when the
                    # watching half is switched off.
                    last_reply = next(
                        (
                            m.get("content", "")
                            for m in reversed(state.messages)
                            if m.get("role") == "assistant"
                        ),
                        "",
                    )
                    # A stored group reply carries its speaker as a "Name: " prefix.
                    speaker = str(data.get("speaker_name", "") or "").strip()
                    if not speaker and ":" in last_reply[:60]:
                        candidate = last_reply.split(":", 1)[0].strip()
                        if any(candidate.casefold() == c.casefold() for c in state.cast):
                            speaker = candidate
                    if not state.character_study_enabled:
                        await send_json(character_study_state_payload({"unchanged": True}))
                    elif not schedule_study_watch(
                        last_reply, speaker or state.char_name, force=True
                    ):
                        logger.info("Character study check already running (or nothing to check)")

                elif mtype == "forget_character_study":
                    await cancel_character_study(state)
                    reset_study(state)
                    logger.info("Character study cleared by user")
                    await send_json(character_study_state_payload())

                elif mtype == "resolve_study_drift":
                    # What the user decided about a reported drift. The study
                    # reports; this is where the character actually changes.
                    action = str(data.get("action", "") or "").strip().lower()
                    alert = state.study_alert or {}
                    items = alert.get("items", [])

                    if action == "reroll":
                        # Arm the correction; the UI then regenerates the reply as
                        # an ordinary swipe, and the note is consumed by that turn.
                        state.study_note = build_drift_note(items)
                    elif action == "accept":
                        # "This is who they are now": the reply stands, and the
                        # sheet is revised to match rather than left contradicting
                        # it. A report with nothing to revise into means the trait
                        # simply no longer holds, and it is dropped.
                        turn = len(conversation_messages(state))
                        changed = 0
                        for item in items:
                            if update_trait(
                                state,
                                item.get("trait_id", ""),
                                item.get("revised", ""),
                                turn=turn,
                            ):
                                changed += 1
                        logger.info(f"Character study revised by the story ({changed} line(s))")
                        await send_json(character_study_state_payload())

                    state.study_alert = None
                    await send_json({"type": "study_drift_resolved", "action": action or "dismiss"})

                elif mtype == "resolve_continuity":
                    # What the user decided about a reported contradiction. The
                    # guard reports; this is where the story actually changes.
                    action = str(data.get("action", "") or "").strip().lower()
                    alert = state.continuity_alert or {}
                    items = alert.get("items", [])

                    if action == "reroll":
                        # Arm the correction; the UI then regenerates the reply as
                        # an ordinary swipe, and the note is consumed by that turn.
                        state.continuity_note = build_continuity_note(items)
                    elif action == "accept":
                        # The new passage wins: the facts it broke are rewritten
                        # (or dropped, when the story simply retired them).
                        for item in items:
                            apply_revision(state, item.get("fact_id", ""), item.get("revised", ""))
                        logger.info(
                            f"Canon revised to match the latest reply ({len(items)} fact(s))"
                        )
                        await send_json(canon_state_payload())

                    state.continuity_alert = None
                    await send_json({"type": "continuity_resolved", "action": action or "dismiss"})

                elif mtype == "set_mood_mode":
                    state.include_mood = bool(data.get("enabled", False))
                    logger.info(f"Mood mode: {'enabled' if state.include_mood else 'disabled'}")
                    await send_json({"type": "ack", "include_mood": state.include_mood})

                elif mtype == "set_animation_mode":
                    state.include_animation = bool(data.get("enabled", False))
                    logger.info(
                        f"Animation mode: {'enabled' if state.include_animation else 'disabled'}"
                    )
                    await send_json({"type": "ack", "include_animation": state.include_animation})

                elif mtype == "set_style":
                    # Persistent Director dials: response length, prose perspective, pacing.
                    length = str(data.get("response_length", "") or "").strip().lower()
                    if length in {"brief", "normal", "detailed", "novella"}:
                        state.response_length = length
                    perspective = str(data.get("narration_perspective", "") or "").strip().lower()
                    if perspective in {"default", "first", "third"}:
                        state.narration_perspective = perspective
                    pacing = str(data.get("pacing", "") or "").strip().lower()
                    if pacing in {"slow", "steady", "advance"}:
                        state.pacing = pacing
                    logger.info(
                        f"Style set: length={state.response_length}, "
                        f"perspective={state.narration_perspective}, pacing={state.pacing}"
                    )
                    await send_json(
                        {
                            "type": "ack",
                            "response_length": state.response_length,
                            "narration_perspective": state.narration_perspective,
                            "pacing": state.pacing,
                        }
                    )

                elif mtype == "set_director_beat":
                    # One-shot scene cue, applied to the next reply only.
                    state.director_beat = str(data.get("beat", "") or "").strip()
                    logger.info(
                        f"Director beat queued: {state.director_beat[:80]}"
                        if state.director_beat
                        else "Director beat cleared"
                    )
                    await send_json({"type": "ack", "director_beat": state.director_beat})

                elif mtype == "set_presence":
                    # Idle presence dial. The quiet window is stored mostly so it
                    # travels with a saved story; the UI is the one holding the clock.
                    mode = str(data.get("mode", "") or "").strip().lower()
                    if mode in PRESENCE_MODES:
                        state.presence_mode = mode
                    try:
                        idle = int(data.get("idle_seconds", state.presence_idle_seconds))
                    except (TypeError, ValueError):
                        idle = state.presence_idle_seconds
                    state.presence_idle_seconds = max(15, min(3600, idle))
                    # A fresh dial setting starts the character's allowance over.
                    state.presence_beats = 0
                    logger.info(
                        f"Presence: {state.presence_mode} "
                        f"(quiet window {state.presence_idle_seconds}s)"
                    )
                    await send_json(
                        {
                            "type": "ack",
                            "presence_mode": state.presence_mode,
                            "presence_idle_seconds": state.presence_idle_seconds,
                        }
                    )

                elif mtype == "presence_beat":
                    # The UI has watched a silence go by and is asking whether the
                    # character may speak first. Every reason to say no is checked
                    # here rather than in the browser, so a stale tab, a reconnect,
                    # or a second window can never talk the character into a
                    # monologue the user did not ask for.
                    try:
                        quiet_seconds = int(data.get("quiet_seconds", 0))
                    except (TypeError, ValueError):
                        quiet_seconds = 0
                    speaker_name = str(data.get("speaker_name", "") or "").strip()

                    busy = bool(state.llm_task and not state.llm_task.done())
                    story_started = any(m.get("role") != "system" for m in state.messages)
                    max_beats = presence_max_beats(state.presence_mode)

                    if state.presence_mode == "off":
                        reason = "presence is off"
                    elif busy or state.speaking or state.recording:
                        reason = "busy"
                    elif not story_started:
                        reason = "the story has not started"
                    elif state.presence_beats >= max_beats:
                        reason = "already spoke unprompted"
                    else:
                        reason = ""

                    if reason:
                        logger.debug(f"Presence beat declined: {reason}")
                        await send_json(
                            {"type": "presence_beat", "accepted": False, "reason": reason}
                        )
                    else:
                        await send_json({"type": "presence_beat", "accepted": True})
                        state.llm_task = asyncio.create_task(
                            process_text_message(
                                "",
                                speaker_name=speaker_name,
                                unprompted=True,
                                quiet_seconds=max(0, quiet_seconds),
                            )
                        )

                elif mtype == "set_autoscene_mode":
                    state.auto_scene = bool(data.get("enabled", False))
                    logger.info(f"Auto-scene mode: {'enabled' if state.auto_scene else 'disabled'}")
                    await send_json({"type": "ack", "auto_scene": state.auto_scene})

                elif mtype == "set_scene":
                    # Persistent scene atmosphere: time of day, weather, and place.
                    # Grounds every reply and drives the UI's ambient theming.
                    state.scene_time = str(data.get("time", "") or "").strip().lower()
                    state.scene_weather = str(data.get("weather", "") or "").strip().lower()
                    state.scene_location = str(data.get("location", "") or "").strip()
                    logger.info(
                        f"Scene set: time={state.scene_time or '-'}, "
                        f"weather={state.scene_weather or '-'}, "
                        f"location={state.scene_location[:60] or '-'}"
                    )
                    await send_json(
                        {
                            "type": "ack",
                            "scene_time": state.scene_time,
                            "scene_weather": state.scene_weather,
                            "scene_location": state.scene_location,
                        }
                    )

                elif mtype == "set_llm_model":
                    state.llm_model = data.get("model", config.llm_model)
                    logger.info(f"LLM model set to: {state.llm_model}")
                    await send_json({"type": "ack", "llm_model": state.llm_model})

                elif mtype == "set_llm_host":
                    state.llm_host = data.get("host", config.llm_host)
                    logger.info(f"LLM host set to: {state.llm_host}")
                    await send_json({"type": "ack", "llm_host": state.llm_host})

                elif mtype == "set_output_mode":
                    state.output_mode = data.get("mode", config.output_mode)
                    logger.info(f"Output mode set to: {state.output_mode}")
                    await send_json({"type": "ack", "output_mode": state.output_mode})

                elif mtype == "set_tts_engine":
                    await handle_set_tts_engine(data)

                elif mtype == "set_voice":
                    voice_name = data.get("voice")
                    if voice_name and tts_engine.load_voice(voice_name):
                        await send_json({"type": "ack", "voice": voice_name})
                    else:
                        await send_json({"type": "error", "message": "Voice not found"})

                elif mtype == "get_available_voices":
                    # Re-read the engine: a mid-session switch replaces it, and
                    # the name bound at connect time would list the old voices.
                    active_tts = engine_manager.tts_engine or tts_engine
                    voices = active_tts.list_voices()
                    await send_json(
                        {
                            "type": "available_voices",
                            "voices": voices,
                            "current": active_tts.current_voice_name,
                            "supports_emotion": bool(
                                getattr(active_tts, "supports_emotion", False)
                            ),
                            "emotions": list(getattr(active_tts, "supported_emotions", [])),
                        }
                    )

                elif mtype == "interrupt":
                    logger.info("User interrupted - cancelling LLM and stopping audio")
                    await cancel_llm(state)
                    state.speaking = False
                    await send_json({"type": "interrupted"})

                elif mtype == "stop_audio":
                    logger.info("Stop audio requested - cancelling TTS generation")
                    await cancel_llm(state)
                    state.speaking = False
                    await send_json({"type": "audio_stopped"})

                elif mtype == "user_audio_start":
                    logger.info("User started speaking - interrupting assistant")
                    await cancel_llm(state)
                    state.speaking = False
                    await send_json({"type": "interrupted"})
                    state.user_audio = bytearray()
                    state.recording = True
                    await send_json({"type": "ack_recording", "recording": True})

                elif mtype == "text_message":
                    text = data.get("text", "").strip()
                    image = data.get("image")  # Base64 encoded image or None
                    image_explainer_model = data.get("image_explainer_model")
                    as_narrator = bool(data.get("as_narrator", False))
                    speaker_name = str(data.get("speaker_name", "") or "").strip()
                    if text or image:
                        if image:
                            logger.info(
                                f"Text message received: {text[:50]}... [with image: {len(image[:50])} chars] model={image_explainer_model}"
                            )
                        else:
                            logger.info(
                                f"Text message received: {text[:50]}..."
                                f"{' [narration]' if as_narrator else ''}"
                                f"{f' [speaker: {speaker_name}]' if speaker_name else ''}"
                            )
                        state.llm_task = asyncio.create_task(
                            process_text_message(
                                text if text else "",
                                image,
                                image_explainer_model,
                                as_narrator=as_narrator,
                                speaker_name=speaker_name,
                            )
                        )
                    else:
                        logger.warning("Empty text message and no image")

                elif mtype == "impersonate_user":
                    user_name = data.get("user_name", "User")
                    user_hint = (data.get("user_hint") or "").strip()
                    logger.info(f"Impersonating user: {user_name}")
                    logger.info(f"User hint: {user_hint}")

                    async def impersonate_user_task(
                        user_name: str = user_name, user_hint: str = user_hint
                    ):
                        """Generate a reply as the user using the current conversation context"""
                        try:
                            await send_json({"type": "impersonation_start"})

                            # Build impersonation messages: use conversation history but swap
                            # the final instruction to generate a user-side reply.
                            # Trimmed the same way a reply is — this used to send
                            # the entire raw transcript, which made one click the
                            # most expensive request in the app on a long story.
                            if state.use_context:
                                history = trimmed_side_task_history(state)
                            else:
                                system_msgs = [m for m in state.messages if m["role"] == "system"]
                                history = system_msgs

                            impersonation_messages = build_impersonation_messages(
                                history, user_name, user_hint
                            )

                            full_text = ""
                            client = get_chat_client(state.llm_host, state.llm_model)
                            async for delta in client.stream_chat(
                                impersonation_messages,
                                model=state.llm_model,
                                # One message from the user, not a scene.
                                options={"num_predict": 1000},
                            ):
                                full_text += delta
                                await send_json({"type": "assistant_delta", "delta": delta})

                            logger.info(f"Impersonation complete: {full_text[:100]}")
                            await send_json(
                                {"type": "impersonation_end", "text": full_text.strip()}
                            )

                        except asyncio.CancelledError:
                            logger.info("Impersonation cancelled")
                            raise
                        except Exception as e:
                            logger.error(f"Impersonation error: {e}")
                            await send_json({"type": "impersonation_end", "text": ""})
                            await send_json({"type": "error", "message": str(e)})

                    state.llm_task = asyncio.create_task(
                        impersonate_user_task(user_name, user_hint)
                    )

                elif mtype == "choose_speaker":
                    # Auto-cast: in a group scene, let the model direct who
                    # naturally speaks next. Purely advisory — the frontend then
                    # requests the actual reply for the chosen character.
                    candidates = [
                        str(c).strip() for c in (data.get("candidates") or []) if str(c).strip()
                    ]
                    if not candidates:
                        await send_json({"type": "speaker_chosen", "name": ""})
                        continue
                    # Auto-cast is the only place the browser names the whole
                    # in-scene cast on every turn; keep the backend's copy current
                    # from it, so Sightlines never lags a roster change.
                    state.cast = list(candidates)
                    chooser_user_name = str(data.get("user_name", "") or "") or state.user_name

                    async def choose_speaker_task(
                        candidates: list[str] = candidates,
                        user_name: str = chooser_user_name,
                    ):
                        try:
                            convo = [m for m in state.messages if m.get("role") != "system"][-8:]
                            prompt_messages = build_speaker_selection_messages(
                                candidates, convo, user_name
                            )
                            raw = ""
                            client = get_chat_client(state.llm_host, state.llm_model)
                            async for delta in client.stream_chat(
                                prompt_messages,
                                model=state.llm_model,
                                think=False,
                                # The answer is one name copied from a list.
                                options={"num_predict": 32},
                            ):
                                raw += delta
                                if len(raw) > 200:
                                    break
                            chosen = select_speaker_candidate(raw, candidates)
                            logger.info(f"Auto-cast chose next speaker: {chosen}")
                            await send_json({"type": "speaker_chosen", "name": chosen})
                        except asyncio.CancelledError:
                            raise
                        except Exception as e:
                            logger.error(f"choose_speaker error: {e}")
                            await send_json({"type": "speaker_chosen", "name": candidates[0]})

                    state.llm_task = asyncio.create_task(choose_speaker_task(candidates))

                elif mtype == "generate_character_card":
                    # Invent a whole character, from a guiding line or from
                    # nothing. Kept off state.llm_task so an in-flight reply is
                    # never cancelled by someone opening the cast manager.
                    guidance = str(data.get("guidance", "") or "").strip()
                    logger.info(
                        "Inventing a character "
                        + (f"from guidance: {guidance[:80]}" if guidance else "from the dice")
                    )

                    async def generate_character_task(guidance: str = guidance):
                        try:
                            await send_json({"type": "character_card_status", "busy": True})
                            async with state.auxiliary_lock:
                                card = await asyncio.wait_for(
                                    generate_character_card(state, guidance),
                                    timeout=CARD_TIMEOUT_SECONDS,
                                )
                            if card is None:
                                await send_json(
                                    {
                                        "type": "character_card_generated",
                                        "card": None,
                                        "error": "The model did not return a usable character.",
                                    }
                                )
                                return
                            await send_json({"type": "character_card_generated", "card": card})
                        except asyncio.CancelledError:
                            logger.info("Character generation cancelled")
                            raise
                        except TimeoutError:
                            logger.error(
                                f"Character generation timed out after {CARD_TIMEOUT_SECONDS}s"
                            )
                            await send_json(
                                {
                                    "type": "character_card_generated",
                                    "card": None,
                                    "error": "The model took too long to answer.",
                                }
                            )
                        except Exception as e:
                            logger.error(f"Character generation failed: {e}")
                            await send_json(
                                {
                                    "type": "character_card_generated",
                                    "card": None,
                                    "error": "Character generation failed.",
                                }
                            )
                        finally:
                            try:
                                await send_json({"type": "character_card_status", "busy": False})
                            except Exception:
                                pass  # connection likely gone

                    if state.character_card_task and not state.character_card_task.done():
                        logger.info("Character generation already running; ignoring request")
                    else:
                        state.character_card_task = asyncio.create_task(generate_character_task())

                elif mtype == "suggest_replies":
                    user_name = data.get("user_name", "User")
                    logger.info(f"Generating reply suggestions for {user_name}")

                    async def suggest_replies_task(user_name: str = user_name):
                        """Generate a few short candidate replies the user could send next."""
                        try:
                            system_msgs = [m for m in state.messages if m["role"] == "system"]
                            history = (
                                trimmed_side_task_history(state)
                                if state.use_context
                                else system_msgs
                            )

                            suggest_messages = build_reply_suggestion_messages(history, user_name)

                            full_text = ""
                            client = get_chat_client(state.llm_host, state.llm_model)
                            async for delta in client.stream_chat(
                                suggest_messages,
                                model=state.llm_model,
                                # Three lines of at most twenty words each.
                                options={"num_predict": 500},
                            ):
                                full_text += delta

                            # Parse lines into clean suggestions. Prefer lines that
                            # look like list items (so any preamble is skipped), and
                            # only fall back to all lines if no markers were used.
                            marker_re = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+(.*)")
                            marked: list[str] = []
                            others: list[str] = []
                            for line in full_text.splitlines():
                                stripped = line.strip()
                                if not stripped:
                                    continue
                                m = marker_re.match(line)
                                if m:
                                    marked.append(m.group(1).strip().strip('"').strip())
                                else:
                                    others.append(stripped.strip('"').strip())
                            chosen = marked if len(marked) >= 2 else marked + others
                            items = [c for c in chosen if c][:3]

                            logger.info(f"Generated {len(items)} suggestions")
                            await send_json({"type": "suggestions", "items": items})
                        except asyncio.CancelledError:
                            logger.info("Suggestion generation cancelled")
                            raise
                        except Exception as e:
                            logger.error(f"Suggestion error: {e}")
                            await send_json({"type": "suggestions", "items": []})

                    state.llm_task = asyncio.create_task(suggest_replies_task(user_name))

                elif mtype == "user_audio_end":
                    state.recording = False
                    await send_json({"type": "ack_recording", "recording": False})

                    pcm = bytes(state.user_audio)
                    logger.info(f"Received {len(pcm)} bytes of audio")

                    if len(pcm) < 3200:  # ~0.1s at 16kHz int16
                        logger.warning("Audio too short, ignoring")
                        await send_json({"type": "transcript", "text": ""})
                        continue

                    # STT
                    logger.info("Transcribing audio...")
                    try:
                        text = stt_engine.transcribe_audio(pcm, sample_rate=16000)
                        logger.info(f"Transcript: {text}")
                        await send_json({"type": "transcript", "text": text})

                        if text.strip():
                            state.llm_task = asyncio.create_task(speak_streaming_from_llm(text))
                        else:
                            logger.warning("Empty transcript")
                    except Exception as e:
                        logger.error(f"Transcription error: {e}")
                        import traceback

                        traceback.print_exc()
                        await send_json({"type": "transcript", "text": "[Error transcribing]"})

            elif "bytes" in msg and msg["bytes"]:
                if state.recording:
                    state.user_audio.extend(msg["bytes"])
                    # Log progress every 50KB
                    if len(state.user_audio) % 50000 < 4096:
                        logger.debug(f"Recording... {len(state.user_audio)} bytes")

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
        await cancel_llm(state)
        await cancel_memory(state)
        await cancel_continuity(state)
        await cancel_story_threads(state)
        await cancel_sightlines(state)
        return
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        import traceback

        traceback.print_exc()
        await cancel_llm(state)
        await cancel_memory(state)
        await cancel_continuity(state)
        await cancel_story_threads(state)
        await cancel_sightlines(state)
        return
