from __future__ import annotations

from .models import Plant, Tent


def tent_allows_species(tent: Tent, species_id) -> bool:
    if not tent.allowed_species.exists():
        return True
    return tent.allowed_species.filter(id=species_id).exists()


def first_disallowed_plant(tent: Tent, plants) -> Plant | None:
    if not tent.allowed_species.exists():
        return None
    allowed_ids = set(tent.allowed_species.values_list("id", flat=True))
    for plant in plants:
        if plant.species_id not in allowed_ids:
            return plant
    return None
