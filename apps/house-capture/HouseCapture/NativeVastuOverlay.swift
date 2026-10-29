import SwiftUI

/// A touch-first, explicitly advisory overlay for a saved scan's plan view.
/// North is expressed clockwise from the top edge of the plan viewport. A nil
/// angle means no usable captured north was available and the user must set it.
struct NativeVastuOverlay: View {
  enum Layout: String, CaseIterable, Identifiable {
    case sectors = "Sectors"
    case grid = "3 × 3"
    var id: String { rawValue }
  }

  @Binding var isPresented: Bool
  let northAngleDegrees: Double?
  let northDescription: String
  let limitation: String
  /// Safe-area insets captured by the full-screen viewer before it opts out of them.
  /// These affect controls only; the drawing and its normalized coordinates stay full-bleed.
  let safeAreaInsets: EdgeInsets
  /// Projected floor boundary in normalized overlay coordinates (origin at top-left).
  /// The overlay is intentionally not drawn if this scan-derived polygon is unavailable.
  let footprint: [CGPoint]

  @State private var layout: Layout = .sectors
  @State private var center = UnitPoint(x: 0.5, y: 0.5)
  @State private var dragOrigin: UnitPoint?
  @State private var manualNorth = 0.0
  @State private var fineAdjustment = 0.0
  @State private var rotationGestureStart: Double?
  @State private var scaleGestureStart: Double?
  @State private var gridScale = 1.0
  @State private var showOptions = false
  @State private var showFineTuning = false
  @State private var showInformation = false

  private var effectiveNorth: Double {
    (northAngleDegrees ?? manualNorth) + fineAdjustment
  }

  var body: some View {
    GeometryReader { proxy in
      ZStack {
        Color.black.opacity(0.20).ignoresSafeArea()

        Canvas { context, size in
          guard footprint.count >= 3 else { return }
          let polygon = polygonPath(in: size)
          let bounds = polygon.boundingRect
          guard bounds.width > 20, bounds.height > 20 else { return }
          context.clip(to: polygon)
          switch layout {
          case .grid: drawGrid(in: &context, polygon: polygon, bounds: bounds, size: size)
          case .sectors: drawSectors(in: &context, polygon: polygon, bounds: bounds, size: size)
          }
        }
        .contentShape(Rectangle())
        .simultaneousGesture(rotationGesture)
        .simultaneousGesture(magnificationGesture)

        Circle()
          .fill(.yellow)
          .overlay(Circle().stroke(.white, lineWidth: 2).padding(5))
          .overlay(Image(systemName: "arrow.up.and.down.and.arrow.left.and.right")
            .font(.system(size: 10, weight: .bold)).foregroundStyle(.black.opacity(0.8)))
          .frame(width: 38, height: 38)
          .shadow(color: .black.opacity(0.45), radius: 5)
          .position(x: center.x * proxy.size.width, y: center.y * proxy.size.height)
          .gesture(centerDrag(in: proxy.size))
          .accessibilityLabel("Drag to move overlay center")

        VStack(alignment: .leading, spacing: 8) {
          compactToolbar
          if showOptions {
            ScrollView {
              expandedControls
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .frame(maxHeight: controlsMaxHeight(in: proxy.size))
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.white.opacity(0.2)))
            .transition(.move(edge: .top).combined(with: .opacity))
          }
          Spacer(minLength: 0)
        }
        .padding(.leading, max(12, safeAreaInsets.leading + 8))
        .padding(.trailing, max(12, safeAreaInsets.trailing + 8))
        .padding(.top, safeAreaInsets.top + 8)
        .padding(.bottom, safeAreaInsets.bottom + 8)
        .animation(.easeInOut(duration: 0.2), value: showOptions)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .ignoresSafeArea(edges: .bottom)
    }
    .onAppear { center = polygonCentroid() }
    .onChange(of: footprint) { _, _ in center = polygonCentroid() }
    .transition(.opacity)
  }

  private var compactToolbar: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 1) {
        Text("Vastu overlay")
          .font(.subheadline.weight(.semibold))
        Text(layout.rawValue + " · " + (northAngleDegrees == nil ? "Manual north" : northDescription))
          .font(.caption2)
          .lineLimit(1)
          .foregroundStyle(.white.opacity(0.82))
      }
      .layoutPriority(1)
      Spacer(minLength: 2)
      Button {
        withAnimation(.easeInOut(duration: 0.2)) { showOptions.toggle() }
      } label: {
        Label(showOptions ? "Done" : "Options", systemImage: showOptions ? "checkmark" : "slider.horizontal.3")
          .font(.caption.weight(.semibold))
          .labelStyle(.titleAndIcon)
          .padding(.horizontal, 10)
          .frame(height: 34)
          .background(.white.opacity(0.14), in: Capsule())
      }
      .accessibilityLabel(showOptions ? "Hide Vastu options" : "Show Vastu options")
      Button { isPresented = false } label: {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .frame(width: 34, height: 34)
          .background(.white.opacity(0.16), in: Circle())
      }
      .accessibilityLabel("Close Vastu overlay")
    }
    .foregroundStyle(.white)
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .background(.ultraThinMaterial, in: Capsule())
    .overlay(Capsule().stroke(.white.opacity(0.22)))
  }

  private var expandedControls: some View {
    VStack(alignment: .leading, spacing: 10) {
      Picker("Overlay layout", selection: $layout) {
        ForEach(Layout.allCases) { item in Text(item.rawValue).tag(item) }
      }
      .pickerStyle(.segmented)
      .tint(.mint)
      .foregroundStyle(.white)

      if northAngleDegrees == nil {
        HStack(spacing: 8) {
          Image(systemName: "location.north.circle")
          Text("Set north manually")
          Slider(value: $manualNorth, in: 0...359, step: 1)
            .accessibilityLabel("Manual north direction")
          Text("N")
            .font(.caption.weight(.bold))
            .rotationEffect(.degrees(manualNorth))
        }
        .font(.caption)
      }

      DisclosureGroup("Fine-tune alignment", isExpanded: $showFineTuning) {
        VStack(alignment: .leading, spacing: 8) {
          HStack(spacing: 8) {
            Text("Center X")
            numericField("50", value: centerXPercent)
            Text("Center Y")
            numericField("50", value: centerYPercent)
          }
          Text("Viewport position (%) · not room measurements")
            .font(.caption2)
            .foregroundStyle(.white.opacity(0.72))
          HStack(spacing: 8) {
            Text("Grid scale")
            numericField("100", value: gridScalePercent)
            Text("%")
            Spacer(minLength: 0)
          }
          HStack(spacing: 8) {
            Text(northAngleDegrees == nil ? "Manual north offset" : "Adjust captured north")
            Slider(value: $fineAdjustment, in: -180...180, step: 1)
            numericField("0", value: northAdjustmentDegrees)
            Text("°")
          }
        }
        .font(.caption)
        .padding(.top, 4)
      }
      .font(.caption.weight(.medium))

      Button("Reset center to room footprint") { center = polygonCentroid() }
        .font(.caption.weight(.medium))

      Text("Drag the center marker to reposition the overlay.")
        .font(.caption2)
        .foregroundStyle(.white.opacity(0.74))
      Text("Pinch to resize the 3 × 3 cells · twist to rotate the overlay.")
        .font(.caption2)
        .foregroundStyle(.white.opacity(0.74))
      if footprint.count >= 3, !contains(CGPoint(x: center.x, y: center.y)) {
        Text("Center is outside the scanned room footprint.")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(.yellow)
      }
      if footprint.count < 3 {
        Text("A projected floor boundary is unavailable. The directional overlay is hidden to avoid implying scan alignment.")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(.yellow)
      }
      DisclosureGroup("About this reference", isExpanded: $showInformation) {
        VStack(alignment: .leading, spacing: 5) {
          Text("Exploratory reference · not a universal verdict")
            .fontWeight(.semibold)
          Text(limitation)
          Text("This view covers the visible room scan only; it does not infer the center of a whole home or apartment.")
          Text("The captured boundary may be incomplete, and unscanned areas are not represented.")
        }
        .font(.caption2)
        .fixedSize(horizontal: false, vertical: true)
        .foregroundStyle(.white.opacity(0.88))
        .padding(.top, 5)
      }
      .font(.caption.weight(.medium))
    }
    .foregroundStyle(.white)
  }

  private func controlsMaxHeight(in size: CGSize) -> CGFloat {
    let available = size.height - safeAreaInsets.top - safeAreaInsets.bottom - 72
    return max(100, min(size.height * 0.58, available))
  }

  private func drawGrid(in context: inout GraphicsContext, polygon: Path, bounds: CGRect, size: CGSize) {
    let point = CGPoint(x: center.x * size.width, y: center.y * size.height)
    let angle = effectiveNorth * .pi / 180
    let across = CGVector(dx: CGFloat(cos(angle)), dy: CGFloat(sin(angle)))
    let along = CGVector(dx: CGFloat(sin(angle)), dy: CGFloat(-cos(angle)))
    let projected = footprint.map { CGPoint(x: $0.x * size.width, y: $0.y * size.height) }
    let acrossValues = projected.map { $0.x * across.dx + $0.y * across.dy }
    let alongValues = projected.map { $0.x * along.dx + $0.y * along.dy }
    let halfWidth = ((acrossValues.max() ?? bounds.width) - (acrossValues.min() ?? 0)) * 0.5 * gridScale
    let halfDepth = ((alongValues.max() ?? bounds.height) - (alongValues.min() ?? 0)) * 0.5 * gridScale
    var path = Path()
    for offset in [-1.0 / 3.0, 1.0 / 3.0] {
      let c = CGPoint(x: point.x + across.dx * halfWidth * CGFloat(offset), y: point.y + across.dy * halfWidth * CGFloat(offset))
      path.move(to: CGPoint(x: c.x - along.dx * halfDepth, y: c.y - along.dy * halfDepth))
      path.addLine(to: CGPoint(x: c.x + along.dx * halfDepth, y: c.y + along.dy * halfDepth))
    }
    for offset in [-1.0 / 3.0, 1.0 / 3.0] {
      let c = CGPoint(x: point.x + along.dx * halfDepth * CGFloat(offset), y: point.y + along.dy * halfDepth * CGFloat(offset))
      path.move(to: CGPoint(x: c.x - across.dx * halfWidth, y: c.y - across.dy * halfWidth))
      path.addLine(to: CGPoint(x: c.x + across.dx * halfWidth, y: c.y + across.dy * halfWidth))
    }
    context.fill(polygon, with: .color(.white.opacity(0.035)))
    context.stroke(path, with: .color(.mint.opacity(0.86)), lineWidth: 2)
    context.stroke(polygon, with: .color(.white.opacity(0.82)), lineWidth: 1.5)
    drawNorth(in: &context, bounds: bounds, size: size)
    let xStep = across.dx * halfWidth * (2.0 / 3.0)
    let yStep = across.dy * halfWidth * (2.0 / 3.0)
    let nxStep = along.dx * halfDepth * (2.0 / 3.0)
    let nyStep = along.dy * halfDepth * (2.0 / 3.0)
    for (label, x, y) in [
      ("N", 0.0, 1.0), ("NE", 1.0, 1.0), ("E", 1.0, 0.0), ("SE", 1.0, -1.0),
      ("S", 0.0, -1.0), ("SW", -1.0, -1.0), ("W", -1.0, 0.0), ("NW", -1.0, 1.0)
    ] {
      drawLabel(label, at: CGPoint(x: point.x + CGFloat(x) * xStep + CGFloat(y) * nxStep,
                                   y: point.y + CGFloat(x) * yStep + CGFloat(y) * nyStep), in: &context)
    }
    drawLabel("Center", at: point, in: &context)
  }

  private func drawSectors(in context: inout GraphicsContext, polygon: Path, bounds: CGRect, size: CGSize) {
    let c = CGPoint(x: center.x * size.width, y: center.y * size.height)
    let radius = max(bounds.width, bounds.height) * 1.35
    let start = (effectiveNorth - 22.5) * .pi / 180
    for index in 0..<8 {
      let a0 = start + Double(index) * .pi / 4
      let a1 = a0 + .pi / 4
      var wedge = Path()
      wedge.move(to: c)
      wedge.addLine(to: CGPoint(x: c.x + radius * CGFloat(sin(a0)), y: c.y - radius * CGFloat(cos(a0))))
      wedge.addArc(center: c, radius: radius, startAngle: .radians(-.pi / 2 + a0), endAngle: .radians(-.pi / 2 + a1), clockwise: false)
      wedge.closeSubpath()
      context.fill(wedge, with: .color(index.isMultiple(of: 2) ? .mint.opacity(0.11) : .cyan.opacity(0.08)))
      context.stroke(wedge, with: .color(.mint.opacity(0.62)), lineWidth: 1.2)
    }
    context.stroke(polygon, with: .color(.white.opacity(0.82)), lineWidth: 1.5)
    drawNorth(in: &context, bounds: bounds, size: size)
    let directionNames = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    for index in directionNames.indices {
      let angle = effectiveNorth + Double(index) * 45
      let radians = angle * .pi / 180
      let direction = CGVector(dx: CGFloat(sin(radians)), dy: CGFloat(-cos(radians)))
      let distance = rayDistance(from: c, direction: direction, size: size) * 0.58
      drawLabel(directionNames[index], at: CGPoint(x: c.x + direction.dx * distance,
                                                  y: c.y + direction.dy * distance), in: &context)
    }
    drawLabel("Center", at: c, in: &context)
  }

  private func drawLabel(_ label: String, at point: CGPoint, in context: inout GraphicsContext) {
    let text = Text(label).font(.system(size: 11, weight: .bold, design: .rounded)).foregroundColor(.white)
    let width: CGFloat = label == "Center" ? 52 : 30
    let pill = CGRect(x: point.x - width / 2, y: point.y - 11, width: width, height: 22)
    context.fill(Path(roundedRect: pill, cornerRadius: 8), with: .color(.black.opacity(0.72)))
    context.stroke(Path(roundedRect: pill, cornerRadius: 8), with: .color(.white.opacity(0.45)), lineWidth: 0.8)
    context.draw(text, at: point)
  }

  private func numericField(_ prompt: String, value: Binding<Double>) -> some View {
    TextField(prompt, value: value, format: .number.precision(.fractionLength(0)))
      .keyboardType(.numberPad)
      .multilineTextAlignment(.trailing)
      .textFieldStyle(.roundedBorder)
      .frame(width: 58)
      .accessibilityLabel(prompt)
  }

  private var centerXPercent: Binding<Double> {
    Binding(
      get: { Double(center.x * 100) },
      set: { center = UnitPoint(x: CGFloat(min(98, max(2, $0)) / 100), y: center.y) }
    )
  }

  private var centerYPercent: Binding<Double> {
    Binding(
      get: { Double(center.y * 100) },
      set: { center = UnitPoint(x: center.x, y: CGFloat(min(98, max(2, $0)) / 100)) }
    )
  }

  private var gridScalePercent: Binding<Double> {
    Binding(
      get: { gridScale * 100 },
      set: { gridScale = min(160, max(45, $0)) / 100 }
    )
  }

  private var northAdjustmentDegrees: Binding<Double> {
    Binding(
      get: { fineAdjustment },
      set: { fineAdjustment = min(180, max(-180, $0)) }
    )
  }

  private func rayDistance(from origin: CGPoint, direction: CGVector, size: CGSize) -> CGFloat {
    var nearest = CGFloat.greatestFiniteMagnitude
    let vertices = footprint.map { CGPoint(x: $0.x * size.width, y: $0.y * size.height) }
    for index in vertices.indices {
      let a = vertices[index]
      let b = vertices[(index + 1) % vertices.count]
      let edge = CGVector(dx: b.x - a.x, dy: b.y - a.y)
      let offset = CGVector(dx: a.x - origin.x, dy: a.y - origin.y)
      let denominator = direction.dx * edge.dy - direction.dy * edge.dx
      guard abs(denominator) > 0.000001 else { continue }
      let t = (offset.dx * edge.dy - offset.dy * edge.dx) / denominator
      let u = (offset.dx * direction.dy - offset.dy * direction.dx) / denominator
      if t >= 0, (0...1).contains(u) { nearest = min(nearest, t) }
    }
    return nearest.isFinite ? nearest : min(size.width, size.height) * 0.25
  }

  private func drawNorth(in context: inout GraphicsContext, bounds: CGRect, size: CGSize) {
    let radians = effectiveNorth * .pi / 180
    let c = CGPoint(x: center.x * size.width, y: center.y * size.height)
    let centerTop = CGPoint(x: c.x, y: c.y - 25)
    let tip = CGPoint(x: centerTop.x + CGFloat(15 * sin(radians)), y: centerTop.y - CGFloat(15 * cos(radians)))
    var arrow = Path()
    arrow.move(to: centerTop)
    arrow.addLine(to: tip)
    context.stroke(arrow, with: .color(.yellow), style: StrokeStyle(lineWidth: 3, lineCap: .round))
    context.draw(Text("N").font(.caption2.bold()).foregroundColor(.yellow), at: CGPoint(x: tip.x + 1, y: tip.y - 10))
  }

  private func centerDrag(in size: CGSize) -> some Gesture {
    DragGesture(minimumDistance: 2)
      .onChanged { value in
        if dragOrigin == nil { dragOrigin = center }
        guard let dragOrigin else { return }
        let candidate = CGPoint(x: dragOrigin.x + value.translation.width / max(1, size.width),
                                y: dragOrigin.y + value.translation.height / max(1, size.height))
        center = UnitPoint(x: min(0.98, max(0.02, candidate.x)), y: min(0.98, max(0.02, candidate.y)))
      }
      .onEnded { _ in dragOrigin = nil }
  }

  private var rotationGesture: some Gesture {
    RotationGesture()
      .onChanged { angle in
        if rotationGestureStart == nil { rotationGestureStart = fineAdjustment }
        fineAdjustment = min(180, max(-180, (rotationGestureStart ?? 0) + angle.degrees))
      }
      .onEnded { _ in rotationGestureStart = nil }
  }

  private var magnificationGesture: some Gesture {
    MagnificationGesture()
      .onChanged { amount in
        if scaleGestureStart == nil { scaleGestureStart = gridScale }
        gridScale = min(1.6, max(0.45, (scaleGestureStart ?? 1) * amount))
      }
      .onEnded { _ in scaleGestureStart = nil }
  }

  private func polygonPath(in size: CGSize) -> Path {
    Path { path in
      guard let first = footprint.first else { return }
      path.move(to: CGPoint(x: first.x * size.width, y: first.y * size.height))
      for point in footprint.dropFirst() {
        path.addLine(to: CGPoint(x: point.x * size.width, y: point.y * size.height))
      }
      path.closeSubpath()
    }
  }

  private func polygonCentroid() -> UnitPoint {
    guard footprint.count >= 3 else { return UnitPoint(x: 0.5, y: 0.5) }
    var twiceArea: CGFloat = 0
    var xSum: CGFloat = 0
    var ySum: CGFloat = 0
    for index in footprint.indices {
      let a = footprint[index]
      let b = footprint[(index + 1) % footprint.count]
      let cross = a.x * b.y - b.x * a.y
      twiceArea += cross
      xSum += (a.x + b.x) * cross
      ySum += (a.y + b.y) * cross
    }
    guard abs(twiceArea) > 0.000001 else {
      let x = footprint.reduce(0) { $0 + $1.x } / CGFloat(footprint.count)
      let y = footprint.reduce(0) { $0 + $1.y } / CGFloat(footprint.count)
      return UnitPoint(x: x, y: y)
    }
    return UnitPoint(x: xSum / (3 * twiceArea), y: ySum / (3 * twiceArea))
  }

  private func contains(_ point: CGPoint) -> Bool {
    guard footprint.count >= 3 else { return false }
    var inside = false
    var j = footprint.count - 1
    for i in footprint.indices {
      let a = footprint[i], b = footprint[j]
      if (a.y > point.y) != (b.y > point.y),
         point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x {
        inside.toggle()
      }
      j = i
    }
    return inside
  }
}
