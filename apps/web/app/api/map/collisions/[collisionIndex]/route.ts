import { prisma } from "@roadsafe-uk/database";
import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ collisionIndex: string }> },
) {
  const { collisionIndex } = await params;

  const collision = await prisma.collision.findUnique({
    where: { collisionIndex },
    select: {
      collisionIndex: true,
      accidentYear: true,
      accidentReference: true,
      longitude: true,
      latitude: true,
      policeForceCode: true,
      severityCode: true,
      numberOfVehicles: true,
      numberOfCasualties: true,
      date: true,
      dayOfWeekCode: true,
      time: true,
      localAuthorityDistrictCode: true,
      localAuthorityHighwayCode: true,
      firstRoadClassCode: true,
      firstRoadNumber: true,
      roadTypeCode: true,
      speedLimit: true,
      junctionDetailCode: true,
      junctionControlCode: true,
      secondRoadClassCode: true,
      secondRoadNumber: true,
      pedestrianCrossingHumanControlCode: true,
      pedestrianCrossingPhysicalFacilitiesCode: true,
      lightConditionsCode: true,
      weatherConditionsCode: true,
      roadSurfaceConditionsCode: true,
      specialConditionsAtSiteCode: true,
      carriagewayHazardsCode: true,
      urbanRuralCode: true,
      didPoliceOfficerAttendScene: true,
      trunkRoadFlag: true,
      sourceStatus: true,
      sourceRevision: true,
      vehicles: {
        select: {
          id: true,
          vehicleReference: true,
          vehicleTypeCode: true,
          towingAndArticulationCode: true,
          vehicleManoeuvreCode: true,
          journeyPurposeCode: true,
          sexOfDriverCode: true,
          ageBandOfDriverCode: true,
          engineCapacityCc: true,
          propulsionCode: true,
          ageOfVehicle: true,
          genericMakeModel: true,
          firstPointOfImpactCode: true,
          skiddingAndOverturningCode: true,
        },
      },
      casualties: {
        select: {
          id: true,
          vehicleReference: true,
          casualtyReference: true,
          casualtyClassCode: true,
          sexOfCasualtyCode: true,
          ageBandOfCasualtyCode: true,
          casualtySeverityCode: true,
          casualtyTypeCode: true,
          pedestrianLocationCode: true,
          pedestrianMovementCode: true,
          carPassengerCode: true,
          busOrCoachPassengerCode: true,
        },
      },
    },
  });

  if (!collision) {
    return jsonError(404, "Collision not found");
  }

  return NextResponse.json(collision);
}
