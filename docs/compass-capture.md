# Compass capture and reconstructed directions

This fork records the iPhone compass during a LiDAR room scan and carries the evidence into reconstruction. Labels describe the outward normal of a wall or window: the direction you face looking through it from inside. These are sensor estimates, not surveyed bearings.

## Capture

Location While Using the App lets Core Location correct magnetic north to true north. Coarse location is sufficient; the app never saves geographic coordinates. Denied permission, an unavailable fix or invalid true heading produces explicitly magnetic observations instead.

The recorder keeps up to two observations per second, paired to the nearest AR pose within 150 ms. It buffers two seconds of fresh poses while tracking is stable and recording is active. Pausing and room/session completion stop the sensors; recovery clears pose input. Readings are saved with the room/session manifest, like the photo index.

`CLHeading` angles describe the portrait top edge, which is not the rear camera's viewing direction in an upright scan. The recorder transforms the three-dimensional magnetic field using `ARCamera.viewMatrix(for: .portrait).inverse`, projects onto the session horizontal plane, and applies true-minus-magnetic declination when available. Original readings and transforms stay inspectable. Compass updates do not rotate live RoomPlan geometry.

## Export

Additive fields retain `house-capture/5`:

- `manifest.compass`: `compass/headings.json`, when observations exist.
- `manifest.compassSampleCount`: observation count.
- `PhotoRecord.compassTimestamp`: linked observation timestamp, within one second of the photo.

An observation stores `room`, monotonic `timestamp`, `frameTimestamp`, Unix `recordedAt`, `magneticHeading`, optional `trueHeading`, `headingAccuracy`, `magneticField`, column-major `cameraTransform` and `deviceTransform`, `poseTimeOffsetSeconds`, `reference` (`true`/`magnetic`), optional unit `northInSession`, optional rear `cameraBearing`, and optional `rejection` reason. Negative accuracy, weak horizontal field or unsynchronized pose yields no usable north. Readings above 25° accuracy are retained with `lowAccuracy`.

Room-only sharing filters observations by room while retaining original indices/timestamps. Import preserves them. Discarding a room during capture removes its observations. Old exports without compass data remain usable.

## Reconstruction

Run `bundle_to_room.py` or `house_to_rooms.py` as usual. The converter uses synchronized readings with reported accuracy at most 25°. It never averages true north with magnetic north, prefers true north once supported by three observations, and requires three readings spanning one second. Circular averaging handles 359°/0°. It requires 70% agreement within 20° and combines the largest retained sensor error with angular spread. Spread over 15° or combined uncertainty over 25° suppresses direction labels.

Converted `compass.samples` retains the original observations in **session coordinates**. An `aligned` result has `compass.north` in **room coordinates**, transformed by `transform.worldToRoom`, plus quality and provenance. Walls/openings get outward `facing` bearings. Photos with a valid linked observation get `compass` bearings. House imports also save north in **house coordinates** under `housePlacement.compass` and the index entry. Bearings run clockwise from the stated north reference.

Keep the converted layout including `compass` when implementing the rebuilt `RoomModule`. The standard viewer reads `BuiltRoom.layout.compass` to display 3D wall/window labels, a north indicator, and plan bearings. If geometry is rotated again, rotate north with it. Missing/uncertain readings remain unlabeled. Model axes do not establish geographic direction. Surface bearing numbers remain valid when geometry and north rotate together.

## Device validation still required

Simulator compilation cannot validate the compass/LiDAR combination. Before relying on a tour scan, compare a known wall/window bearing with the camera readout at several phone tilts, then review exported directions after reconstruction and after a room rotation. Also check denied Location permission, magnetic fallback, pause/resume, interruption recovery and room-only export/import on the iPhone.

Indoor magnetic fields can bias even consistent readings. Displayed uncertainty reflects sensor-reported accuracy and observed disagreement; it cannot establish that nearby metal introduced no systematic error.

Apple references: [CLHeading](https://developer.apple.com/documentation/corelocation/clheading), [true heading](https://developer.apple.com/documentation/corelocation/clheading/trueheading), [heading accuracy](https://developer.apple.com/documentation/corelocation/clheading/headingaccuracy), [camera view matrix](https://developer.apple.com/documentation/arkit/arcamera/viewmatrix(for:)).
