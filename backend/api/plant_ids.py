import re
from collections.abc import Iterable

from .models import Experiment, Plant, Species

CATEGORY_PREFIX_MAP: dict[str, str] = {
    "nepenthes": "NP",
    "flytrap": "VF",
    "drosera": "DR",
    "sarracenia": "SA",
    "pinguicula": "PG",
}


def prefix_for_species(species: Species) -> str:
    category = (species.category or "").strip().lower()
    return CATEGORY_PREFIX_MAP.get(category, "PL")


class ExperimentPlantIdAllocator:
    def __init__(self, experiment: Experiment, preload_ids: Iterable[str] | None = None):
        self.experiment = experiment
        if preload_ids is None:
            preload_ids = Plant.objects.filter(experiment=experiment).exclude(plant_id="").values_list(
                "plant_id", flat=True
            )
        self._used_ids = {plant_id for plant_id in preload_ids if plant_id}
        self._next_by_prefix: dict[str, int] = {}
        self._max_pattern_cache: dict[str, re.Pattern[str]] = {}

    def allocate(self, species: Species) -> str:
        prefix = prefix_for_species(species)
        next_value = self._next_by_prefix.get(prefix)
        if next_value is None:
            next_value = self._find_next_seed(prefix)

        candidate = self._format(prefix, next_value)
        while candidate in self._used_ids:
            next_value += 1
            candidate = self._format(prefix, next_value)

        self._used_ids.add(candidate)
        self._next_by_prefix[prefix] = next_value + 1
        return candidate

    def _find_next_seed(self, prefix: str) -> int:
        pattern = self._max_pattern_cache.get(prefix)
        if pattern is None:
            pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
            self._max_pattern_cache[prefix] = pattern

        highest = 0
        for plant_id in self._used_ids:
            match = pattern.match(plant_id)
            if match:
                highest = max(highest, int(match.group(1)))
        return highest + 1

    @staticmethod
    def _format(prefix: str, value: int) -> str:
        return f"{prefix}-{value:03d}"
