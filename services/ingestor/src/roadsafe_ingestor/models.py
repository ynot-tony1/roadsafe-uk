"""Typed, validated representations of one STATS19 CSV row.

Each model exposes `from_raw_row`, which takes the raw dict[str, str] a CSV
reader produces and applies the defensive parsing in `parsing.py`. Rows that
fail validation are raised as `RowRejectedError` and are recorded by the
importer without ever including the raw row's full contents, only the
non-identifying reason and the collision/vehicle/casualty reference, since
STATS19 rows are anonymised but a full row dump could still leak transcription
noise into logs.
"""

from __future__ import annotations

from datetime import date as date_type

from pydantic import BaseModel, ConfigDict

from roadsafe_ingestor import parsing
from roadsafe_ingestor.coordinates import Coordinates, resolve_coordinates


class RowRejectedError(ValueError):
    def __init__(self, reference: str, reason: str) -> None:
        self.reference = reference
        self.reason = reason
        super().__init__(f"row {reference} rejected: {reason}")


class CollisionRow(BaseModel):
    model_config = ConfigDict(frozen=True)

    collision_index: str
    accident_year: int
    accident_reference: str
    location_easting_osgr: int | None
    location_northing_osgr: int | None
    coordinates: Coordinates | None
    police_force_code: int
    severity_code: int
    number_of_vehicles: int
    number_of_casualties: int
    date: date_type
    day_of_week_code: int
    time: str | None
    local_authority_district_code: str
    local_authority_highway_code: str | None
    first_road_class_code: int
    first_road_number: str | None
    road_type_code: int | None
    speed_limit: int | None
    junction_detail_code: int | None
    junction_control_code: int | None
    second_road_class_code: int | None
    second_road_number: str | None
    pedestrian_crossing_human_control_code: int | None
    pedestrian_crossing_physical_facilities_code: int | None
    light_conditions_code: int | None
    weather_conditions_code: int | None
    road_surface_conditions_code: int | None
    special_conditions_at_site_code: int | None
    carriageway_hazards_code: int | None
    urban_rural_code: int | None
    did_police_officer_attend_scene: int | None
    trunk_road_flag: bool | None
    lsoa_code: str | None

    @classmethod
    def from_raw_row(cls, row: dict[str, str]) -> CollisionRow:
        collision_index = (row.get("accident_index") or "").strip()
        if not collision_index:
            raise RowRejectedError(reference="<missing>", reason="empty accident_index")

        date_value = parsing.parse_date(row.get("date"))
        if date_value is None:
            raise RowRejectedError(collision_index, "unparseable date")

        try:
            severity_code = parsing.parse_required_int(
                row.get("accident_severity"), field_name="accident_severity"
            )
            police_force_code = parsing.parse_required_int(
                row.get("police_force"), field_name="police_force"
            )
            first_road_class_code = parsing.parse_required_int(
                row.get("first_road_class"), field_name="first_road_class"
            )
            day_of_week_code = parsing.parse_required_int(
                row.get("day_of_week"), field_name="day_of_week"
            )
            number_of_vehicles = parsing.parse_required_int(
                row.get("number_of_vehicles"), field_name="number_of_vehicles"
            )
            number_of_casualties = parsing.parse_required_int(
                row.get("number_of_casualties"), field_name="number_of_casualties"
            )
        except ValueError as exc:
            raise RowRejectedError(collision_index, str(exc)) from exc

        local_authority_district_code = (row.get("local_authority_district") or "").strip()
        if not local_authority_district_code:
            raise RowRejectedError(collision_index, "missing local_authority_district")

        easting = parsing.parse_nullable_int(row.get("location_easting_osgr"))
        northing = parsing.parse_nullable_int(row.get("location_northing_osgr"))
        longitude = parsing.parse_nullable_float(row.get("longitude"))
        latitude = parsing.parse_nullable_float(row.get("latitude"))
        coordinates = resolve_coordinates(
            longitude=longitude, latitude=latitude, easting=easting, northing=northing
        )

        return cls(
            collision_index=collision_index,
            accident_year=parsing.parse_required_int(
                row.get("accident_year"), field_name="accident_year"
            ),
            accident_reference=(row.get("accident_reference") or collision_index).strip(),
            location_easting_osgr=easting,
            location_northing_osgr=northing,
            coordinates=coordinates,
            police_force_code=police_force_code,
            severity_code=severity_code,
            number_of_vehicles=number_of_vehicles,
            number_of_casualties=number_of_casualties,
            date=date_value,
            day_of_week_code=day_of_week_code,
            time=parsing.parse_time(row.get("time")),
            local_authority_district_code=local_authority_district_code,
            local_authority_highway_code=(row.get("local_authority_highway") or "").strip() or None,
            first_road_class_code=first_road_class_code,
            first_road_number=(row.get("first_road_number") or "").strip() or None,
            road_type_code=parsing.parse_nullable_int(row.get("road_type")),
            speed_limit=parsing.parse_nullable_int(row.get("speed_limit")),
            junction_detail_code=parsing.parse_nullable_int(row.get("junction_detail")),
            junction_control_code=parsing.parse_nullable_int(row.get("junction_control")),
            second_road_class_code=parsing.parse_nullable_int(row.get("second_road_class")),
            second_road_number=(row.get("second_road_number") or "").strip() or None,
            pedestrian_crossing_human_control_code=parsing.parse_nullable_int(
                row.get("pedestrian_crossing_human_control")
            ),
            pedestrian_crossing_physical_facilities_code=parsing.parse_nullable_int(
                row.get("pedestrian_crossing_physical_facilities")
            ),
            light_conditions_code=parsing.parse_nullable_int(row.get("light_conditions")),
            weather_conditions_code=parsing.parse_nullable_int(row.get("weather_conditions")),
            road_surface_conditions_code=parsing.parse_nullable_int(
                row.get("road_surface_conditions")
            ),
            special_conditions_at_site_code=parsing.parse_nullable_int(
                row.get("special_conditions_at_site")
            ),
            carriageway_hazards_code=parsing.parse_nullable_int(row.get("carriageway_hazards")),
            urban_rural_code=parsing.parse_nullable_int(row.get("urban_or_rural_area")),
            did_police_officer_attend_scene=parsing.parse_nullable_int(
                row.get("did_police_officer_attend_scene_of_accident")
            ),
            trunk_road_flag=parsing.parse_bool_flag(row.get("trunk_road_flag")),
            lsoa_code=(row.get("lsoa_of_accident_location") or "").strip() or None,
        )


class VehicleRow(BaseModel):
    model_config = ConfigDict(frozen=True)

    collision_index: str
    vehicle_reference: int
    vehicle_type_code: int | None
    towing_and_articulation_code: int | None
    vehicle_manoeuvre_code: int | None
    vehicle_direction_from_code: int | None
    vehicle_direction_to_code: int | None
    vehicle_location_restricted_lane: int | None
    junction_location_code: int | None
    skidding_and_overturning_code: int | None
    hit_object_in_carriageway_code: int | None
    vehicle_leaving_carriageway_code: int | None
    hit_object_off_carriageway_code: int | None
    first_point_of_impact_code: int | None
    vehicle_left_hand_drive: int | None
    journey_purpose_code: int | None
    sex_of_driver_code: int | None
    age_of_driver: int | None
    age_band_of_driver_code: int | None
    engine_capacity_cc: int | None
    propulsion_code: int | None
    age_of_vehicle: int | None
    generic_make_model: str | None
    driver_imd_decile: int | None

    @classmethod
    def from_raw_row(cls, row: dict[str, str]) -> VehicleRow:
        collision_index = (row.get("accident_index") or "").strip()
        if not collision_index:
            raise RowRejectedError(reference="<missing>", reason="empty accident_index")
        vehicle_reference = parsing.parse_nullable_int(row.get("vehicle_reference"))
        if vehicle_reference is None:
            raise RowRejectedError(collision_index, "missing vehicle_reference")

        return cls(
            collision_index=collision_index,
            vehicle_reference=vehicle_reference,
            vehicle_type_code=parsing.parse_nullable_int(row.get("vehicle_type")),
            towing_and_articulation_code=parsing.parse_nullable_int(
                row.get("towing_and_articulation")
            ),
            vehicle_manoeuvre_code=parsing.parse_nullable_int(row.get("vehicle_manoeuvre")),
            vehicle_direction_from_code=parsing.parse_nullable_int(
                row.get("vehicle_direction_from")
            ),
            vehicle_direction_to_code=parsing.parse_nullable_int(row.get("vehicle_direction_to")),
            vehicle_location_restricted_lane=parsing.parse_nullable_int(
                row.get("vehicle_location_restricted_lane")
            ),
            junction_location_code=parsing.parse_nullable_int(row.get("junction_location")),
            skidding_and_overturning_code=parsing.parse_nullable_int(
                row.get("skidding_and_overturning")
            ),
            hit_object_in_carriageway_code=parsing.parse_nullable_int(
                row.get("hit_object_in_carriageway")
            ),
            vehicle_leaving_carriageway_code=parsing.parse_nullable_int(
                row.get("vehicle_leaving_carriageway")
            ),
            hit_object_off_carriageway_code=parsing.parse_nullable_int(
                row.get("hit_object_off_carriageway")
            ),
            first_point_of_impact_code=parsing.parse_nullable_int(row.get("first_point_of_impact")),
            vehicle_left_hand_drive=parsing.parse_nullable_int(row.get("vehicle_left_hand_drive")),
            journey_purpose_code=parsing.parse_nullable_int(row.get("journey_purpose_of_driver")),
            sex_of_driver_code=parsing.parse_nullable_int(row.get("sex_of_driver")),
            age_of_driver=parsing.parse_nullable_int(row.get("age_of_driver")),
            age_band_of_driver_code=parsing.parse_nullable_int(row.get("age_band_of_driver")),
            engine_capacity_cc=parsing.parse_nullable_int(row.get("engine_capacity_cc")),
            propulsion_code=parsing.parse_nullable_int(row.get("propulsion_code")),
            age_of_vehicle=parsing.parse_nullable_int(row.get("age_of_vehicle")),
            generic_make_model=(row.get("generic_make_model") or "").strip() or None,
            driver_imd_decile=parsing.parse_nullable_int(row.get("driver_imd_decile")),
        )


class CasualtyRow(BaseModel):
    model_config = ConfigDict(frozen=True)

    collision_index: str
    vehicle_reference: int | None
    casualty_reference: int
    casualty_class_code: int | None
    sex_of_casualty_code: int | None
    age_of_casualty: int | None
    age_band_of_casualty_code: int | None
    casualty_severity_code: int
    pedestrian_location_code: int | None
    pedestrian_movement_code: int | None
    car_passenger_code: int | None
    bus_or_coach_passenger_code: int | None
    pedestrian_road_maintenance_worker_code: int | None
    casualty_type_code: int
    casualty_home_area_type_code: int | None
    casualty_imd_decile: int | None

    @classmethod
    def from_raw_row(cls, row: dict[str, str]) -> CasualtyRow:
        collision_index = (row.get("accident_index") or "").strip()
        if not collision_index:
            raise RowRejectedError(reference="<missing>", reason="empty accident_index")
        casualty_reference = parsing.parse_nullable_int(row.get("casualty_reference"))
        if casualty_reference is None:
            raise RowRejectedError(collision_index, "missing casualty_reference")

        try:
            casualty_severity_code = parsing.parse_required_int(
                row.get("casualty_severity"), field_name="casualty_severity"
            )
            casualty_type_code = parsing.parse_required_int(
                row.get("casualty_type"), field_name="casualty_type"
            )
        except ValueError as exc:
            raise RowRejectedError(collision_index, str(exc)) from exc

        return cls(
            collision_index=collision_index,
            vehicle_reference=parsing.parse_nullable_int(row.get("vehicle_reference")),
            casualty_reference=casualty_reference,
            casualty_class_code=parsing.parse_nullable_int(row.get("casualty_class")),
            sex_of_casualty_code=parsing.parse_nullable_int(row.get("sex_of_casualty")),
            age_of_casualty=parsing.parse_nullable_int(row.get("age_of_casualty")),
            age_band_of_casualty_code=parsing.parse_nullable_int(row.get("age_band_of_casualty")),
            casualty_severity_code=casualty_severity_code,
            pedestrian_location_code=parsing.parse_nullable_int(row.get("pedestrian_location")),
            pedestrian_movement_code=parsing.parse_nullable_int(row.get("pedestrian_movement")),
            car_passenger_code=parsing.parse_nullable_int(row.get("car_passenger")),
            bus_or_coach_passenger_code=parsing.parse_nullable_int(
                row.get("bus_or_coach_passenger")
            ),
            pedestrian_road_maintenance_worker_code=parsing.parse_nullable_int(
                row.get("pedestrian_road_maintenance_worker")
            ),
            casualty_type_code=casualty_type_code,
            casualty_home_area_type_code=parsing.parse_nullable_int(
                row.get("casualty_home_area_type")
            ),
            casualty_imd_decile=parsing.parse_nullable_int(row.get("casualty_imd_decile")),
        )
