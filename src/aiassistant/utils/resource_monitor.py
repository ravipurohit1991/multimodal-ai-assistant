"""
Resource monitoring utilities using pynvml (NVIDIA Management Library) and psutil.
Provides accurate GPU and system resource metrics.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

import psutil

try:
    import pynvml

    NVML_AVAILABLE = True
except ImportError:
    NVML_AVAILABLE = False

from aiassistant.logger import logger


@dataclass
class GPUStats:
    """GPU statistics for a single device"""

    device_id: int
    name: str
    memory_used_mb: float
    memory_total_mb: float
    memory_percent: float
    utilization_percent: float
    temperature_c: Optional[float] = None
    power_usage_w: Optional[float] = None


@dataclass
class SystemStats:
    """System-wide resource statistics"""

    cpu_percent: float
    ram_used_mb: float
    ram_total_mb: float
    ram_percent: float
    process_ram_mb: float
    process_cpu_percent: float


class ResourceMonitor:
    """Monitor GPU and system resources using pynvml and psutil"""

    def __init__(self):
        """Initialize resource monitor"""
        self._nvml_initialized = False
        self._process = psutil.Process()

        if NVML_AVAILABLE:
            try:
                pynvml.nvmlInit()
                self._nvml_initialized = True
                device_count = pynvml.nvmlDeviceGetCount()
                logger.info(f"NVML initialized: {device_count} GPU(s) detected")
            except Exception as e:
                logger.warning(f"Failed to initialize NVML: {e}")
                self._nvml_initialized = False
        else:
            logger.warning(
                "pynvml not available - GPU monitoring disabled. Install with: pip install nvidia-ml-py"
            )

    def get_gpu_stats(self, device_id: int = 0) -> Optional[GPUStats]:
        """
        Get statistics for a specific GPU device.

        Args:
            device_id: GPU device index (default: 0)

        Returns:
            GPUStats object or None if GPU monitoring unavailable
        """
        if not self._nvml_initialized:
            return None

        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(device_id)

            # Get device name
            name = pynvml.nvmlDeviceGetName(handle)
            if isinstance(name, bytes):
                name = name.decode("utf-8")

            # Get memory info
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            memory_used_mb = mem_info.used / (1024**2)  # type: ignore
            memory_total_mb = mem_info.total / (1024**2)  # type: ignore
            memory_percent = (mem_info.used / mem_info.total) * 100  # type: ignore

            # Get utilization
            utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)
            utilization_percent = utilization.gpu

            # Get temperature (optional)
            try:
                temperature_c = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            except Exception:
                temperature_c = None

            # Get power usage (optional)
            try:
                power_usage_w = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0  # Convert mW to W
            except Exception:
                power_usage_w = None

            return GPUStats(
                device_id=device_id,
                name=name,
                memory_used_mb=memory_used_mb,
                memory_total_mb=memory_total_mb,
                memory_percent=memory_percent,
                utilization_percent=utilization_percent,  # type: ignore
                temperature_c=temperature_c,
                power_usage_w=power_usage_w,
            )
        except Exception as e:
            logger.error(f"Error getting GPU stats for device {device_id}: {e}")
            return None

    def get_all_gpu_stats(self) -> list[GPUStats]:
        """
        Get statistics for all available GPUs.

        Returns:
            List of GPUStats objects (empty if GPU monitoring unavailable)
        """
        if not self._nvml_initialized:
            return []

        stats = []
        try:
            device_count = pynvml.nvmlDeviceGetCount()
            for i in range(device_count):
                gpu_stats = self.get_gpu_stats(i)
                if gpu_stats:
                    stats.append(gpu_stats)
        except Exception as e:
            logger.error(f"Error getting all GPU stats: {e}")

        return stats

    def get_system_stats(self) -> SystemStats:
        """
        Get system-wide resource statistics.

        Returns:
            SystemStats object with CPU and RAM metrics
        """
        # System-wide stats
        cpu_percent = psutil.cpu_percent(interval=0.1)
        ram = psutil.virtual_memory()
        ram_used_mb = ram.used / (1024**2)
        ram_total_mb = ram.total / (1024**2)
        ram_percent = ram.percent

        # Process-specific stats
        mem_info = self._process.memory_info()
        process_ram_mb = mem_info.rss / (1024**2)
        process_cpu_percent = self._process.cpu_percent(interval=0.1)

        return SystemStats(
            cpu_percent=cpu_percent,
            ram_used_mb=ram_used_mb,
            ram_total_mb=ram_total_mb,
            ram_percent=ram_percent,
            process_ram_mb=process_ram_mb,
            process_cpu_percent=process_cpu_percent,
        )

    def get_gpu_memory_before_after(self, device_id: int = 0) -> tuple[float, Callable[[], float]]:
        """
        Helper to measure GPU memory delta for model loading.

        Args:
            device_id: GPU device index

        Returns:
            Tuple of (memory_before_mb, get_delta_function)

        Example:
            mem_before, get_delta = monitor.get_gpu_memory_before_after()
            # ... load model ...
            delta_mb = get_delta()
        """
        stats_before = self.get_gpu_stats(device_id)
        mem_before = stats_before.memory_used_mb if stats_before else 0.0

        def get_delta() -> float:
            stats_after = self.get_gpu_stats(device_id)
            mem_after = stats_after.memory_used_mb if stats_after else 0.0
            return max(0.0, mem_after - mem_before)

        return mem_before, get_delta

    def shutdown(self):
        """Cleanup resources"""
        if self._nvml_initialized:
            try:
                pynvml.nvmlShutdown()
                logger.info("NVML shutdown")
            except Exception as e:
                logger.warning(f"Error during NVML shutdown: {e}")


# Global monitor instance
_monitor: Optional[ResourceMonitor] = None


def get_resource_monitor() -> ResourceMonitor:
    """Get the global resource monitor instance"""
    global _monitor
    if _monitor is None:
        _monitor = ResourceMonitor()
    return _monitor
