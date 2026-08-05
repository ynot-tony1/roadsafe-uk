export interface H3Cell {
  h3Index: string;
  collisionCount: number;
  fatalCount: number;
  seriousCount: number;
  slightCount: number;
}

export interface H3Response {
  mode: string;
  h3Resolution: 5 | 7 | 9;
  cells: H3Cell[];
}

export interface ClusterPoint {
  h3Index: string;
  latitude: number;
  longitude: number;
  collisionCount: number;
  fatalCount: number;
  seriousCount: number;
  slightCount: number;
}

export interface ClustersResponse {
  mode: string;
  h3Resolution: 5 | 7 | 9;
  clusters: ClusterPoint[];
}

export interface CollisionPoint {
  collisionIndex: string;
  latitude: number;
  longitude: number;
  severityCode: number;
  accidentYear: number;
  date: string;
  localAuthorityDistrictCode: string;
  numberOfVehicles: number;
  numberOfCasualties: number;
}

export interface CollisionsResponse {
  collisions: CollisionPoint[];
  nextCursor: string | null;
}

export interface RoadSegmentGeo {
  id: string;
  name: string | null;
  roadClass: string | null;
  safetyRating: "NEUTRAL" | "AMBER" | "DARK_AMBER" | "RED";
  collisionCount: number;
  fatalCount: number;
  seriousCount: number;
  slightCount: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

export interface RoadsResponse {
  roads: RoadSegmentGeo[];
}

export interface LegendItem {
  code: string;
  label: string;
  color: string;
  description?: string;
}

export interface LegendResponse {
  title: string;
  items: LegendItem[];
}

export interface CollisionVehicle {
  id: string;
  vehicleReference: number;
  vehicleTypeCode: number | null;
  towingAndArticulationCode: number | null;
  vehicleManoeuvreCode: number | null;
  journeyPurposeCode: number | null;
  sexOfDriverCode: number | null;
  ageBandOfDriverCode: number | null;
  engineCapacityCc: number | null;
  propulsionCode: number | null;
  ageOfVehicle: number | null;
  genericMakeModel: string | null;
  firstPointOfImpactCode: number | null;
  skiddingAndOverturningCode: number | null;
}

export interface CollisionCasualty {
  id: string;
  vehicleReference: number | null;
  casualtyReference: number;
  casualtyClassCode: number | null;
  sexOfCasualtyCode: number | null;
  ageBandOfCasualtyCode: number | null;
  casualtySeverityCode: number;
  casualtyTypeCode: number;
  pedestrianLocationCode: number | null;
  pedestrianMovementCode: number | null;
  carPassengerCode: number | null;
  busOrCoachPassengerCode: number | null;
}

export interface CollisionDetail {
  collisionIndex: string;
  accidentYear: number;
  accidentReference: string;
  longitude: number | null;
  latitude: number | null;
  policeForceCode: number;
  severityCode: number;
  numberOfVehicles: number;
  numberOfCasualties: number;
  date: string;
  dayOfWeekCode: number;
  time: string | null;
  localAuthorityDistrictCode: string;
  localAuthorityHighwayCode: string | null;
  firstRoadClassCode: number;
  firstRoadNumber: string | null;
  roadTypeCode: number | null;
  speedLimit: number | null;
  junctionDetailCode: number | null;
  junctionControlCode: number | null;
  secondRoadClassCode: number | null;
  secondRoadNumber: string | null;
  pedestrianCrossingHumanControlCode: number | null;
  pedestrianCrossingPhysicalFacilitiesCode: number | null;
  lightConditionsCode: number | null;
  weatherConditionsCode: number | null;
  roadSurfaceConditionsCode: number | null;
  specialConditionsAtSiteCode: number | null;
  carriagewayHazardsCode: number | null;
  urbanRuralCode: number | null;
  didPoliceOfficerAttendScene: number | null;
  trunkRoadFlag: boolean | null;
  sourceStatus: string;
  sourceRevision: string;
  vehicles: CollisionVehicle[];
  casualties: CollisionCasualty[];
}

export interface AvailableFilters {
  severity: { code: number; label: string }[];
  roadUserType: string[];
  localAuthorities: { code: string; name: string }[];
  codeLists: Record<string, { code: number; label: string }[]>;
}

export interface MapViewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}
