-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('FINAL', 'PROVISIONAL');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "collisions" (
    "collision_index" STRING NOT NULL,
    "accident_year" INT4 NOT NULL,
    "accident_reference" STRING NOT NULL,
    "location_easting_osgr" INT4,
    "location_northing_osgr" INT4,
    "longitude" FLOAT8,
    "latitude" FLOAT8,
    "police_force_code" INT4 NOT NULL,
    "severity_code" INT4 NOT NULL,
    "number_of_vehicles" INT4 NOT NULL,
    "number_of_casualties" INT4 NOT NULL,
    "date" DATE NOT NULL,
    "day_of_week_code" INT4 NOT NULL,
    "time" STRING(5),
    "local_authority_district_code" STRING NOT NULL,
    "local_authority_highway_code" STRING,
    "first_road_class_code" INT4 NOT NULL,
    "first_road_number" STRING,
    "road_type_code" INT4,
    "speed_limit" INT4,
    "junction_detail_code" INT4,
    "junction_control_code" INT4,
    "second_road_class_code" INT4,
    "second_road_number" STRING,
    "pedestrian_crossing_human_control_code" INT4,
    "pedestrian_crossing_physical_facilities_code" INT4,
    "light_conditions_code" INT4,
    "weather_conditions_code" INT4,
    "road_surface_conditions_code" INT4,
    "special_conditions_at_site_code" INT4,
    "carriageway_hazards_code" INT4,
    "urban_rural_code" INT4,
    "did_police_officer_attend_scene" INT4,
    "trunk_road_flag" BOOL,
    "lsoa_code" STRING,
    "h3_resolution_5" STRING,
    "h3_resolution_7" STRING,
    "h3_resolution_9" STRING,
    "source_status" "SourceStatus" NOT NULL,
    "source_revision" STRING NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collisions_pkey" PRIMARY KEY ("collision_index")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" STRING NOT NULL,
    "collision_index" STRING NOT NULL,
    "vehicle_reference" INT4 NOT NULL,
    "vehicle_type_code" INT4,
    "towing_and_articulation_code" INT4,
    "vehicle_manoeuvre_code" INT4,
    "vehicle_direction_from_code" INT4,
    "vehicle_direction_to_code" INT4,
    "vehicle_location_restricted_lane" INT4,
    "junction_location_code" INT4,
    "skidding_and_overturning_code" INT4,
    "hit_object_in_carriageway_code" INT4,
    "vehicle_leaving_carriageway_code" INT4,
    "hit_object_off_carriageway_code" INT4,
    "first_point_of_impact_code" INT4,
    "vehicle_left_hand_drive" INT4,
    "journey_purpose_code" INT4,
    "sex_of_driver_code" INT4,
    "age_of_driver" INT4,
    "age_band_of_driver_code" INT4,
    "engine_capacity_cc" INT4,
    "propulsion_code" INT4,
    "age_of_vehicle" INT4,
    "generic_make_model" STRING,
    "driver_imd_decile" INT4,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casualties" (
    "id" STRING NOT NULL,
    "collision_index" STRING NOT NULL,
    "vehicle_reference" INT4,
    "casualty_reference" INT4 NOT NULL,
    "casualty_class_code" INT4,
    "sex_of_casualty_code" INT4,
    "age_of_casualty" INT4,
    "age_band_of_casualty_code" INT4,
    "casualty_severity_code" INT4 NOT NULL,
    "pedestrian_location_code" INT4,
    "pedestrian_movement_code" INT4,
    "car_passenger_code" INT4,
    "bus_or_coach_passenger_code" INT4,
    "pedestrian_road_maintenance_worker_code" INT4,
    "casualty_type_code" INT4 NOT NULL,
    "casualty_home_area_type_code" INT4,
    "casualty_imd_decile" INT4,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "casualties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_definitions" (
    "id" STRING NOT NULL,
    "dataset_name" STRING NOT NULL,
    "field_name" STRING NOT NULL,
    "code" INT4 NOT NULL,
    "label" STRING NOT NULL,
    "valid_from_year" INT4 NOT NULL,
    "valid_to_year" INT4,
    "source_version" STRING NOT NULL,

    CONSTRAINT "code_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_authorities" (
    "code" STRING NOT NULL,
    "name" STRING NOT NULL,
    "region" STRING,
    "population_denominator" INT4,
    "population_denominator_year" INT4,
    "population_source" STRING,
    "traffic_denominator_vehicle_miles" FLOAT8,
    "traffic_denominator_year" INT4,
    "traffic_source" STRING,
    "road_length_km" FLOAT8,
    "road_length_year" INT4,
    "road_length_source" STRING,
    "boundary_geojson_url" STRING,

    CONSTRAINT "local_authorities_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "h3_metrics" (
    "id" STRING NOT NULL,
    "h3_index" STRING NOT NULL,
    "resolution" INT4 NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "filter_dimension" STRING NOT NULL,
    "filter_value" STRING NOT NULL,
    "collision_count" INT4 NOT NULL,
    "casualty_count" INT4 NOT NULL,
    "fatal_count" INT4 NOT NULL,
    "serious_count" INT4 NOT NULL,
    "slight_count" INT4 NOT NULL,
    "pedestrian_count" INT4 NOT NULL,
    "cyclist_count" INT4 NOT NULL,
    "motorcyclist_count" INT4 NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_import_id" STRING NOT NULL,

    CONSTRAINT "h3_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_metrics" (
    "id" STRING NOT NULL,
    "year" INT4 NOT NULL,
    "geography_type" STRING NOT NULL,
    "geography_code" STRING NOT NULL,
    "severity_code" INT4,
    "road_user_type" STRING,
    "road_condition" STRING,
    "time_category" STRING,
    "dimension_value" STRING,
    "collision_count" INT4 NOT NULL,
    "casualty_count" INT4 NOT NULL,
    "source_status" "SourceStatus" NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_import_id" STRING NOT NULL,

    CONSTRAINT "annual_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" STRING NOT NULL,
    "source_year" INT4 NOT NULL,
    "source_status" "SourceStatus" NOT NULL,
    "source_revision" STRING NOT NULL,
    "source_checksum" STRING NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "collisions_seen" INT4 NOT NULL DEFAULT 0,
    "vehicles_seen" INT4 NOT NULL DEFAULT 0,
    "casualties_seen" INT4 NOT NULL DEFAULT 0,
    "rows_inserted" INT4 NOT NULL DEFAULT 0,
    "rows_updated" INT4 NOT NULL DEFAULT 0,
    "rows_rejected" INT4 NOT NULL DEFAULT 0,
    "aggregates_created" INT4 NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "workflow_run_id" STRING,
    "git_sha" STRING,
    "error_summary" STRING(4000),

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collisions_accident_year_idx" ON "collisions"("accident_year");

-- CreateIndex
CREATE INDEX "collisions_date_idx" ON "collisions"("date");

-- CreateIndex
CREATE INDEX "collisions_latitude_longitude_idx" ON "collisions"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "collisions_local_authority_district_code_idx" ON "collisions"("local_authority_district_code");

-- CreateIndex
CREATE INDEX "collisions_police_force_code_idx" ON "collisions"("police_force_code");

-- CreateIndex
CREATE INDEX "collisions_severity_code_idx" ON "collisions"("severity_code");

-- CreateIndex
CREATE INDEX "collisions_h3_resolution_5_idx" ON "collisions"("h3_resolution_5");

-- CreateIndex
CREATE INDEX "collisions_h3_resolution_7_idx" ON "collisions"("h3_resolution_7");

-- CreateIndex
CREATE INDEX "collisions_h3_resolution_9_idx" ON "collisions"("h3_resolution_9");

-- CreateIndex
CREATE INDEX "collisions_source_status_idx" ON "collisions"("source_status");

-- CreateIndex
CREATE INDEX "collisions_speed_limit_idx" ON "collisions"("speed_limit");

-- CreateIndex
CREATE INDEX "collisions_urban_rural_code_idx" ON "collisions"("urban_rural_code");

-- CreateIndex
CREATE INDEX "vehicles_vehicle_type_code_idx" ON "vehicles"("vehicle_type_code");

-- CreateIndex
CREATE INDEX "vehicles_age_band_of_driver_code_idx" ON "vehicles"("age_band_of_driver_code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_collision_index_vehicle_reference_key" ON "vehicles"("collision_index", "vehicle_reference");

-- CreateIndex
CREATE INDEX "casualties_casualty_type_code_idx" ON "casualties"("casualty_type_code");

-- CreateIndex
CREATE INDEX "casualties_casualty_severity_code_idx" ON "casualties"("casualty_severity_code");

-- CreateIndex
CREATE INDEX "casualties_age_band_of_casualty_code_idx" ON "casualties"("age_band_of_casualty_code");

-- CreateIndex
CREATE UNIQUE INDEX "casualties_collision_index_vehicle_reference_casualty_refer_key" ON "casualties"("collision_index", "vehicle_reference", "casualty_reference");

-- CreateIndex
CREATE INDEX "code_definitions_field_name_idx" ON "code_definitions"("field_name");

-- CreateIndex
CREATE UNIQUE INDEX "code_definitions_dataset_name_field_name_code_valid_from_ye_key" ON "code_definitions"("dataset_name", "field_name", "code", "valid_from_year");

-- CreateIndex
CREATE INDEX "h3_metrics_resolution_period_start_period_end_idx" ON "h3_metrics"("resolution", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "h3_metrics_h3_index_idx" ON "h3_metrics"("h3_index");

-- CreateIndex
CREATE UNIQUE INDEX "h3_metrics_h3_index_resolution_period_start_period_end_filt_key" ON "h3_metrics"("h3_index", "resolution", "period_start", "period_end", "filter_dimension", "filter_value");

-- CreateIndex
CREATE INDEX "annual_metrics_geography_type_geography_code_idx" ON "annual_metrics"("geography_type", "geography_code");

-- CreateIndex
CREATE INDEX "annual_metrics_year_idx" ON "annual_metrics"("year");

-- CreateIndex
CREATE UNIQUE INDEX "annual_metrics_year_geography_type_geography_code_severity__key" ON "annual_metrics"("year", "geography_type", "geography_code", "severity_code", "road_user_type", "road_condition", "time_category", "dimension_value", "source_status");

-- CreateIndex
CREATE INDEX "ingestion_runs_source_year_source_status_idx" ON "ingestion_runs"("source_year", "source_status");

-- CreateIndex
CREATE INDEX "ingestion_runs_status_idx" ON "ingestion_runs"("status");

-- CreateIndex
CREATE INDEX "ingestion_runs_started_at_idx" ON "ingestion_runs"("started_at");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_collision_index_fkey" FOREIGN KEY ("collision_index") REFERENCES "collisions"("collision_index") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casualties" ADD CONSTRAINT "casualties_collision_index_fkey" FOREIGN KEY ("collision_index") REFERENCES "collisions"("collision_index") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casualties" ADD CONSTRAINT "casualties_collision_index_vehicle_reference_fkey" FOREIGN KEY ("collision_index", "vehicle_reference") REFERENCES "vehicles"("collision_index", "vehicle_reference") ON DELETE RESTRICT ON UPDATE CASCADE;

