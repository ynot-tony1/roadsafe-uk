-- CreateEnum
CREATE TYPE "RoadSafetyRating" AS ENUM ('NEUTRAL', 'AMBER', 'DARK_AMBER', 'RED');

-- AlterTable
ALTER TABLE "collisions" ADD COLUMN "road_segment_id" STRING;

-- CreateTable
CREATE TABLE "road_segments" (
    "id" STRING NOT NULL,
    "osm_way_id" INT8 NOT NULL,
    "name" STRING,
    "road_class" STRING,
    "geometry" GEOMETRY(LineString, 4326) NOT NULL,
    "collision_count" INT4 NOT NULL DEFAULT 0,
    "fatal_count" INT4 NOT NULL DEFAULT 0,
    "serious_count" INT4 NOT NULL DEFAULT 0,
    "slight_count" INT4 NOT NULL DEFAULT 0,
    "safety_rating" "RoadSafetyRating" NOT NULL DEFAULT 'NEUTRAL',
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "road_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "road_segments_osm_way_id_key" ON "road_segments"("osm_way_id");

-- CreateIndex
CREATE INDEX "road_segments_safety_rating_idx" ON "road_segments"("safety_rating");

-- CreateIndex
CREATE INDEX "road_segments_osm_way_id_idx" ON "road_segments"("osm_way_id");

-- CreateIndex, spatial: not expressible in schema.prisma, added by hand.
-- Confirmed against the live cluster that `USING GIST` produces an
-- inverted index CockroachDB's planner actually uses for ST_DWithin
-- (verified via EXPLAIN), not a full scan.
CREATE INDEX "road_segments_geometry_idx" ON "road_segments" USING GIST ("geometry");

-- CreateIndex
CREATE INDEX "collisions_road_segment_id_idx" ON "collisions"("road_segment_id");

-- AddForeignKey
ALTER TABLE "collisions" ADD CONSTRAINT "collisions_road_segment_id_fkey" FOREIGN KEY ("road_segment_id") REFERENCES "road_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
