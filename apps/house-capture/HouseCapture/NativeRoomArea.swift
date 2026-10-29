import Foundation
import RoomPlan
import simd

/// A conservative floor-footprint estimate derived from the saved RoomPlan floor polygon.
/// Values are in square metres and square feet; the source is measured geometry, but should
/// still be presented as approximate because RoomPlan itself is an estimate of the room.
enum NativeRoomArea {
  struct Estimate: Hashable {
    let squareMeters: Double
    let squareFeet: Double
    /// Floor boundary projected onto XZ in the house frame; suitable for plan overlays.
    let floorPolygon: [SIMD2<Double>]
    /// Elevation of this RoomPlan floor surface in house-frame metres.
    let floorElevation: Double
  }

  private static let squareFeetPerSquareMeter = 10.76391041671

  /// Reads the actual saved CapturedRoom model. There is deliberately no wall-box, mesh-bounds,
  /// or USDZ fallback: those cannot establish the room's floor footprint reliably.
  static func estimate(from roomFile: URL, toHouse: simd_float4x4 = matrix_identity_float4x4) -> Estimate? {
    guard let data = try? Data(contentsOf: roomFile),
          let room = try? JSONDecoder().decode(CapturedRoom.self, from: data) else { return nil }
    return estimate(room: room, toHouse: toHouse)
  }

  /// RoomPlan can represent a floor as a polygon. A room with multiple floor surfaces is
  /// withheld here because summing them could count overlapping geometry twice; the viewer
  /// currently exposes room-specific values only, never a sum across scans or house zones.
  static func estimate(room: CapturedRoom, toHouse: simd_float4x4 = matrix_identity_float4x4) -> Estimate? {
    guard room.floors.count == 1, let floor = room.floors.first else { return nil }

    let polygon = floor.polygonCorners.map { corner -> SIMD2<Double> in
      let world = toHouse * floor.transform * SIMD4<Float>(corner, 1)
      return SIMD2(Double(world.x), Double(world.z))
    }
    guard let area = validPolygonArea(polygon), area >= 0.5, area <= 500 else { return nil }

    let center = toHouse * floor.transform * SIMD4<Float>(0, 0, 0, 1)
    guard center.y.isFinite else { return nil }
    return Estimate(squareMeters: area, squareFeet: area * squareFeetPerSquareMeter,
                    floorPolygon: polygon, floorElevation: Double(center.y))
  }

  private static func validPolygonArea(_ input: [SIMD2<Double>]) -> Double? {
    guard input.count >= 3, input.allSatisfy({ $0.x.isFinite && $0.y.isFinite }) else { return nil }

    // Drop adjacent duplicate vertices and a repeated closing vertex. A degenerate path must
    // not turn into a plausible-looking rectangle or an area of zero.
    var points: [SIMD2<Double>] = []
    for point in input {
      if let previous = points.last, simd_distance_squared(point, previous) < 1e-10 { continue }
      points.append(point)
    }
    if points.count > 1, simd_distance_squared(points[0], points[points.count - 1]) < 1e-10 {
      points.removeLast()
    }
    guard points.count >= 3, !hasSelfIntersection(points) else { return nil }

    var twiceArea = 0.0
    for i in points.indices {
      let next = points[(i + 1) % points.count]
      twiceArea += points[i].x * next.y - next.x * points[i].y
    }
    let area = abs(twiceArea) / 2
    return area.isFinite && area > 0 ? area : nil
  }

  private static func hasSelfIntersection(_ polygon: [SIMD2<Double>]) -> Bool {
    let count = polygon.count
    for i in 0..<count {
      let a = polygon[i], b = polygon[(i + 1) % count]
      for j in (i + 1)..<count {
        // Neighboring edges share a legitimate endpoint; ignore those pairs.
        if j == i || j == (i + 1) % count || i == (j + 1) % count { continue }
        let c = polygon[j], d = polygon[(j + 1) % count]
        if segmentsIntersect(a, b, c, d) { return true }
      }
    }
    return false
  }

  private static func segmentsIntersect(_ a: SIMD2<Double>, _ b: SIMD2<Double>,
                                        _ c: SIMD2<Double>, _ d: SIMD2<Double>) -> Bool {
    let epsilon = 1e-8
    func cross(_ p: SIMD2<Double>, _ q: SIMD2<Double>, _ r: SIMD2<Double>) -> Double {
      (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
    }
    func onSegment(_ p: SIMD2<Double>, _ q: SIMD2<Double>, _ r: SIMD2<Double>) -> Bool {
      q.x >= min(p.x, r.x) - epsilon && q.x <= max(p.x, r.x) + epsilon &&
        q.y >= min(p.y, r.y) - epsilon && q.y <= max(p.y, r.y) + epsilon
    }

    let abC = cross(a, b, c), abD = cross(a, b, d)
    let cdA = cross(c, d, a), cdB = cross(c, d, b)
    if ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
       ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon)) { return true }
    if abs(abC) <= epsilon && onSegment(a, c, b) { return true }
    if abs(abD) <= epsilon && onSegment(a, d, b) { return true }
    if abs(cdA) <= epsilon && onSegment(c, a, d) { return true }
    if abs(cdB) <= epsilon && onSegment(c, b, d) { return true }
    return false
  }
}
