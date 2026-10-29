import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { RoomLayout } from '../../../packages/room-runtime/types';
import { CompassOverlay, compassDescription, hasNorth } from './compass';
import { showLayout } from './layout';
import { boundsCenter, computeVastuPreview, polygonCentroid, type VastuViewSettings } from './vastu';
import { makeVastuAgentContext } from './vastu-context';
import { disposeObjects } from '../../../packages/room-runtime/dispose';
import { installAppearanceToggle } from './appearance';
import './inspect.css';

type MeasuredLayout = Omit<RoomLayout, 'walls'> & { source?: string; walls: (RoomLayout['walls'][number] & { height?: number })[] };
const host = document.querySelector<HTMLElement>('#inspect-viewport')!;
const canvas = document.querySelector<HTMLCanvasElement>('#inspect-canvas')!;
const plan = document.querySelector<HTMLElement>('#inspect-plan')!;
const status = document.querySelector<HTMLElement>('#inspect-status')!;
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#142126');
scene.add(new THREE.HemisphereLight('#e4f1ff', '#716249', 3));
const key = new THREE.DirectionalLight('#ffffff', 2); key.position.set(4, 8, 5); scene.add(key);
const camera = new THREE.PerspectiveCamera(45, 1, .03, 150);
camera.position.set(8, 7, 8);
const controls = new OrbitControls(camera, canvas);
controls.minDistance = .5; controls.maxDistance = 80; controls.maxPolarAngle = Math.PI / 2;
let geometry = new THREE.Group(); scene.add(geometry);
let overlay: CompassOverlay | undefined;
let inPlan = false;
let vastuEnabled = false;
let walls: {group:THREE.Group; midpoint:THREE.Vector3; inward:THREE.Vector3}[] = [];
const finiteVector = (value: unknown, length: number): value is number[] => Array.isArray(value)
  && value.length === length && value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10_000);

function readLayout(value: unknown): MeasuredLayout {
  const data = value as MeasuredLayout;
  if (!data || !Array.isArray(data.walls) || !data.walls.length || data.walls.length > 200
    || !data.walls.every(w => finiteVector(w.a, 2) && finiteVector(w.b, 2) && finiteVector(w.u, 3)
      && Number.isFinite(w.length) && w.length > 0 && w.length < 1_000
      && (w.height === undefined || Number.isFinite(w.height) && w.height > 0 && w.height < 100)
      && Array.isArray(w.openings) && w.openings.length < 100
      && w.openings.every(o => Number.isFinite(o.u0) && Number.isFinite(o.u1)
        && (o.v0 === undefined || Number.isFinite(o.v0)) && (o.v1 === undefined || Number.isFinite(o.v1))))
    || !Array.isArray(data.objects) || data.objects.length > 2_000
    || !data.objects.every(o => typeof o.category === 'string' && finiteVector(o.center, 3)
      && finiteVector(o.size, 3) && o.size.every(n => n > 0 && n < 1_000) && Number.isFinite(o.rotY))
    || !Array.isArray(data.polygon) || data.polygon.length < 3 || data.polygon.length > 2_000
    || !data.polygon.every(p => finiteVector(p, 2))) {
    throw new Error('Choose a room.json produced by bundle_to_room.py or house_to_rooms.py with a measured floor polygon.');
  }
  return data;
}

function render() {
  if (inPlan) return;
  for (const wall of walls) wall.group.visible = camera.position.clone().sub(wall.midpoint).dot(wall.inward) > 0;
  renderer.render(scene, camera);
  overlay?.update(camera);
}
controls.addEventListener('change', render);
installAppearanceToggle(document.querySelector<HTMLButtonElement>('#appearance-toggle')!, appearance => {
  scene.background = new THREE.Color(appearance === 'dark' ? '#142126' : '#e7ecea');
  render();
});

function show(value: unknown, label: string) {
  const data = readLayout(value);
  scene.remove(geometry); disposeObjects([geometry]);
  geometry = new THREE.Group(); scene.add(geometry); walls = [];
  overlay?.dispose();
  const wallTop = Math.max(...data.walls.map(w => w.height ?? 2.8));
  const shape = new THREE.Shape(data.polygon.map(p => new THREE.Vector2(p[0], -p[1])));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({color:'#c5b495', side:THREE.DoubleSide}));
  floor.rotation.x = -Math.PI / 2; geometry.add(floor);
  for (const wall of data.walls) {
    const group = new THREE.Group(); geometry.add(group);
    const height = wall.height ?? wallTop;
    const cuts = [...new Set([0, wall.length, ...wall.openings.flatMap(o => [o.u0, o.u1]).map(u => THREE.MathUtils.clamp(u, 0, wall.length))])].sort((a,b)=>a-b);
    const paint = new THREE.MeshStandardMaterial({color:'#8cabb1', roughness:.9});
    for (let i=1; i<cuts.length; i++) {
      const a=cuts[i-1], b=cuts[i], mid=(a+b)/2;
      const openings=wall.openings.filter(o => mid>o.u0 && mid<o.u1);
      const levels=[...new Set([0,height,...openings.flatMap(o=>[o.v0??0,o.v1??height]).map(v=>THREE.MathUtils.clamp(v,0,height))])].sort((a,b)=>a-b);
      for(let j=1;j<levels.length;j++) {
        const low=levels[j-1],high=levels[j],y=(low+high)/2;
        if(b-a<.001 || high-low<.001 || openings.some(o=>y>(o.v0??0)&&y<(o.v1??height))) continue;
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(b-a,high-low,.07),paint);
        mesh.position.set(wall.a[0]+wall.u[0]*mid,y,wall.a[1]+wall.u[2]*mid);
        mesh.rotation.y=Math.atan2(-wall.u[2],wall.u[0]); group.add(mesh);
      }
    }
    walls.push({group,midpoint:new THREE.Vector3((wall.a[0]+wall.b[0])/2,0,(wall.a[1]+wall.b[1])/2),
      inward:new THREE.Vector3(-wall.u[2],0,wall.u[0])});
  }
  for(const object of data.objects) {
    const color=object.category==='table'?'#b88e59':object.category==='television'?'#2b3d49':'#698895';
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...object.size as [number,number,number]),new THREE.MeshStandardMaterial({color,roughness:.85}));
    mesh.position.fromArray(object.center); mesh.rotation.y=object.rotY; geometry.add(mesh);
  }
  const bounds=new THREE.Box3().setFromObject(geometry), center=bounds.getCenter(new THREE.Vector3());
  camera.aspect=host.clientWidth/host.clientHeight;
  const vertical=THREE.MathUtils.degToRad(camera.fov), horizontal=2*Math.atan(Math.tan(vertical/2)*camera.aspect);
  const radius=bounds.getBoundingSphere(new THREE.Sphere()).radius;
  const distance=radius/Math.sin(Math.min(vertical,horizontal)/2)*1.08;
  controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(1,.85,1).normalize().multiplyScalar(distance));
  camera.near=Math.max(.02,distance/1000);camera.far=Math.max(100,distance*10);camera.updateProjectionMatrix();
  overlay=new CompassOverlay(host,data,wallTop,render);overlay.setVisible(!inPlan);
  vastuEnabled = false;
  showLayout(plan,data,label);
  addVastuPreview(data);
  controls.update(); render();
  status.textContent=`${label} · Measured geometry · ${compassDescription(data.compass)}`;
}

function addVastuPreview(data: MeasuredLayout) {
  const toolbar = document.createElement('div'); toolbar.className = 'vastu-controls';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Vastu preview';
  button.setAttribute('aria-pressed', 'false');
  const settingsPanel = document.createElement('fieldset'); settingsPanel.className = 'vastu-settings'; settingsPanel.hidden = true;
  const legend = document.createElement('legend'); legend.textContent = 'Exploratory overlay settings'; settingsPanel.append(legend);
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy review context';
  copy.hidden = true;
  const fallback = document.createElement('textarea'); fallback.className = 'vastu-copy-fallback'; fallback.readOnly = true;
  fallback.setAttribute('aria-label', 'Copyable local review context'); fallback.hidden = true;
  const note = document.createElement('p'); note.className = 'vastu-note';
  note.hidden = true;
  note.textContent = 'Optional user-defined exploratory view. It does not provide Vastu verdicts or establish a universal center.';
  const compass = data.compass;
  const suggestedCenter = polygonCentroid(data.polygon) ?? boundsCenter(data.polygon) ?? [0,0];
  const bboxCenter = boundsCenter(data.polygon, hasNorth(compass) ? [compass.north[0],compass.north[2]] : [0,-1]) ?? suggestedCenter;
  const orientationMetrics = (n: readonly [number,number]) => { const len=Math.hypot(...n)||1,nx=n[0]/len,nz=n[1]/len,ex=-nz,ez=nx;const east=data.polygon.map(p=>p[0]*ex+p[1]*ez),northing=data.polygon.map(p=>p[0]*nx+p[1]*nz);return {width:Math.max(.1,Math.max(...east)-Math.min(...east)),depth:Math.max(.1,Math.max(...northing)-Math.min(...northing))}; };
  const initialMetrics=orientationMetrics(hasNorth(compass)?[compass.north[0],compass.north[2]]:[0,-1]);
  const gridWidth = initialMetrics.width, gridDepth = initialMetrics.depth;
  const settings: VastuViewSettings = { method:'sectors', centerMode:'bounds', center:bboxCenter, suggestedCenter:bboxCenter,
    gridWidth, gridDepth, northSource: compass?.sourceFile ?? 'not recorded', showCenter:true, showLabels:true, opacity:.2 };
  let fieldTarget: HTMLElement = settingsPanel;
  function field(labelText: string, control: HTMLElement) { const label=document.createElement('label');label.className='vastu-field';label.append(document.createTextNode(labelText),control);fieldTarget.append(label);return control; }
  const method = field('Layout', document.createElement('select')) as HTMLSelectElement;
  method.add(new Option('Eight radial sectors (45°)','sectors')); method.add(new Option('North-aligned 3 × 3 grid','grid'));
  const fineTune = document.createElement('details'); fineTune.className = 'vastu-fine-tune';
  const fineTuneTitle = document.createElement('summary'); fineTuneTitle.textContent = 'Fine-tune'; fineTune.append(fineTuneTitle);
  settingsPanel.append(fineTune);
  const advancedPanel = document.createElement('div'); advancedPanel.className = 'vastu-advanced'; fineTune.append(advancedPanel);
  fieldTarget = advancedPanel;
  const centerMode = field('Suggested center', document.createElement('select')) as HTMLSelectElement;
  centerMode.add(new Option('North-aligned bounding-box center','bounds'));centerMode.add(new Option('Polygon area centroid','centroid'));centerMode.add(new Option('Manual center','manual'));
  const centerX=field('Center X (m)',document.createElement('input')) as HTMLInputElement; centerX.type='number';centerX.step='.01';
  const centerZ=field('Center Z (m)',document.createElement('input')) as HTMLInputElement; centerZ.type='number';centerZ.step='.01';
  const width=field('Grid width (m)',document.createElement('input')) as HTMLInputElement;width.type='number';width.min='.1';width.step='.1';
  const depth=field('Grid depth (m)',document.createElement('input')) as HTMLInputElement;depth.type='number';depth.min='.1';depth.step='.1';
  const north=field(hasNorth(compass)?'North adjustment clockwise (°)':'User-defined north angle clockwise from model -Z (°)',document.createElement('input')) as HTMLInputElement;north.type='number';north.step='1';
  north.value='0';north.title=hasNorth(compass)?'Adjustment applied to the recorded north vector; the recorded source remains unchanged.':'User-defined and unverified direction; no compass measurement was recorded.';
  const opacity=field('Overlay opacity',document.createElement('input')) as HTMLInputElement;opacity.type='range';opacity.min='5';opacity.max='60';opacity.value='20';
  const showCenter=field('Show center marker',document.createElement('input')) as HTMLInputElement;showCenter.type='checkbox';showCenter.checked=true;
  const showLabels=field('Show labels',document.createElement('input')) as HTMLInputElement;showLabels.type='checkbox';showLabels.checked=true;
  const moveCenter=document.createElement('button');moveCenter.type='button';moveCenter.textContent='Move center';moveCenter.setAttribute('aria-pressed','false');
  const adjustOverlay=document.createElement('button');adjustOverlay.type='button';adjustOverlay.textContent='Adjust overlay';adjustOverlay.setAttribute('aria-pressed','false');adjustOverlay.title='Touch: twist with two fingers to rotate the overlay; in grid mode, pinch to resize it. This mode pauses plan panning.';
  const adjustHelp=document.createElement('span');adjustHelp.className='vastu-touch-help';adjustHelp.textContent='Two fingers: twist to rotate the overlay; in grid mode, pinch to resize it. Plan panning pauses while this mode is on.';adjustHelp.hidden=true;
  const reset=document.createElement('button');reset.type='button';reset.textContent='Reset suggestions';reset.title='Restore the bounding-box center suggestion and zero north adjustment.';
  const fitGrid=document.createElement('button');fitGrid.type='button';fitGrid.textContent='Fit grid to outline';fitGrid.title='Set grid width and depth to the floor polygon bounds along the current north-aligned axes.';
  settingsPanel.insertBefore(moveCenter, fineTune);
  settingsPanel.insertBefore(adjustOverlay, fineTune);
  settingsPanel.insertBefore(adjustHelp, fineTune);
  advancedPanel.append(reset, fitGrid);
  const svg=plan.querySelector('svg');
  const overlayGroup=svg ? document.createElementNS(svg.namespaceURI,'g') : undefined;
  overlayGroup?.setAttribute('class','vastu-overlay vastu-off');
  const outlineCount=data.rooms?.length||1;if(svg&&overlayGroup)svg.insertBefore(overlayGroup,svg.children[outlineCount]??null);
  const annotationsGroup=svg ? document.createElementNS(svg.namespaceURI,'g') : undefined;
  annotationsGroup?.setAttribute('class','vastu-annotations vastu-off');
  if(svg&&annotationsGroup)svg.append(annotationsGroup);
  let dragging=false;
  let adjusting=false;
  let gridSizeEdited=false;
  function invalidateCopiedContext() { fallback.hidden=true;fallback.value='';copy.textContent='Copy review context'; }
  function currentNorth(): [number,number] | undefined {
    const angle=Number(north.value)*Math.PI/180;
    if(hasNorth(compass)) { const nx=compass.north[0],nz=compass.north[2];return [nx*Math.cos(angle)-nz*Math.sin(angle),nz*Math.cos(angle)+nx*Math.sin(angle)]; }
    if(north.value==='')return;
    return [Math.sin(angle),-Math.cos(angle)];
  }
  let centerIsInside=true;
  function updateNote() { note.textContent=`Optional user-defined exploratory view for this room scan only · ${settings.method==='grid'?'3 × 3 north-aligned grid':'eight radial 45° sectors'} · ${centerMode.options[centerMode.selectedIndex].text} at X ${settings.center[0].toFixed(2)} m, Z ${settings.center[1].toFixed(2)} m. ${settings.method==='grid'?'The middle grid cell is only the center cell of this user-selected grid; it is not a universal Brahmasthan definition.':''} ${hasNorth(compass)?`North uses recorded ${compass.reference} north with a ${settings.northOverrideDegrees??0}° clockwise user adjustment; recorded source and estimated ±${Math.ceil(compass.accuracyDegrees)}° uncertainty are retained.${compass.accuracyDegrees>10?' Uncertainty exceeds 10°, so sector boundaries may shift materially.':''}`:'North is user-defined and unverified; no compass direction was recorded. 0° points toward model -Z and increasing angles turn clockwise.'} ${centerIsInside?'':'The selected center is outside the floor outline; this remains a user-defined exploratory view.'} No Vastu verdicts are provided.`; }
  function redraw() {
    if(!svg||!overlayGroup)return;
    settings.method=method.value as VastuViewSettings['method'];settings.centerMode=centerMode.value as VastuViewSettings['centerMode'];
    settings.gridWidth=Math.max(.1,Number(width.value)||gridWidth);settings.gridDepth=Math.max(.1,Number(depth.value)||gridDepth);
    settings.northOverrideDegrees=Number(north.value)||0;settings.showCenter=showCenter.checked;settings.showLabels=showLabels.checked;settings.opacity=Number(opacity.value)/100;
    settings.center=[Number(centerX.value)||0,Number(centerZ.value)||0];
    const n=currentNorth();settings.northMode=hasNorth(compass)?'recorded-adjustment':'manual-absolute';settings.effectiveNorth=n?[n[0],n[1]]:undefined;overlayGroup.replaceChildren();annotationsGroup?.replaceChildren();
    if(!n) return;
    const preview=computeVastuPreview(data.polygon,n,settings.center); if(!preview)return;centerIsInside=preview.centerInside;
    const clipId=`vastu-clip-${Math.random().toString(36).slice(2)}`;
    const defs=document.createElementNS(svg.namespaceURI,'defs'),clip=document.createElementNS(svg.namespaceURI,'clipPath');clip.id=clipId;
    const polygon=document.createElementNS(svg.namespaceURI,'polygon');polygon.setAttribute('points',data.polygon.map(p=>p.join(',')).join(' '));clip.append(polygon);defs.append(clip);overlayGroup.append(defs);
    const drawing=document.createElementNS(svg.namespaceURI,'g');drawing.setAttribute('clip-path',`url(#${clipId})`);overlayGroup.append(drawing);
    const colors=['#4c99b8','#659e88','#b9a64e','#c6854d','#bc6661','#a66a9c','#687caf','#4c95a0'];
    if(settings.method==='sectors') for(const [i,sector] of preview.sectors.entries()) for(const piece of sector.pieces){const poly=document.createElementNS(svg.namespaceURI,'polygon');poly.setAttribute('points',piece.map(p=>p.join(',')).join(' '));poly.setAttribute('fill',colors[i]);poly.setAttribute('fill-opacity',String(settings.opacity));drawing.append(poly);}
    else {
      const [nx,nz]=n, east:[number,number]=[-nz,nx];const c=settings.center;
      const local=(u:number,v:number):[number,number]=>[c[0]+east[0]*u-nx*v,c[1]+east[1]*u-nz*v];
      const border=[local(-settings.gridWidth/2,-settings.gridDepth/2),local(settings.gridWidth/2,-settings.gridDepth/2),local(settings.gridWidth/2,settings.gridDepth/2),local(-settings.gridWidth/2,settings.gridDepth/2)];
      const grid=document.createElementNS(svg.namespaceURI,'polygon');grid.setAttribute('points',border.map(p=>p.join(',')).join(' '));grid.setAttribute('fill','var(--vastu-grid-fill)');grid.setAttribute('fill-opacity',String(settings.opacity));grid.setAttribute('stroke','var(--vastu-grid-line)');grid.setAttribute('stroke-width','.025');drawing.append(grid);
      for(const v of [-settings.gridDepth/6,settings.gridDepth/6]){const line=document.createElementNS(svg.namespaceURI,'line'),a=local(-settings.gridWidth/2,v),b=local(settings.gridWidth/2,v);line.setAttribute('x1',String(a[0]));line.setAttribute('y1',String(a[1]));line.setAttribute('x2',String(b[0]));line.setAttribute('y2',String(b[1]));line.setAttribute('stroke','var(--vastu-grid-line)');line.setAttribute('stroke-width','.025');drawing.append(line);}
      for(const u of [-settings.gridWidth/6,settings.gridWidth/6]){const line=document.createElementNS(svg.namespaceURI,'line'),a=local(u,-settings.gridDepth/2),b=local(u,settings.gridDepth/2);line.setAttribute('x1',String(a[0]));line.setAttribute('y1',String(a[1]));line.setAttribute('x2',String(b[0]));line.setAttribute('y2',String(b[1]));line.setAttribute('stroke','var(--vastu-grid-line)');line.setAttribute('stroke-width','.025');drawing.append(line);}
      if(settings.showLabels&&annotationsGroup){const names=['NW','N','NE','W','Grid center','E','SW','S','SE'];for(let row=0;row<3;row++)for(let col=0;col<3;col++){const [x,y]=local((col-1)*settings.gridWidth/3,(row-1)*settings.gridDepth/3),label=document.createElementNS(svg.namespaceURI,'text');label.setAttribute('x',String(x));label.setAttribute('y',String(y));label.setAttribute('class','vastu-label');label.setAttribute('text-anchor','middle');label.textContent=names[row*3+col];annotationsGroup.append(label);}}
    }
    if(settings.showCenter&&annotationsGroup){const dot=document.createElementNS(svg.namespaceURI,'circle');dot.setAttribute('cx',String(settings.center[0]));dot.setAttribute('cy',String(settings.center[1]));dot.setAttribute('r','.08');dot.setAttribute('class','vastu-center');annotationsGroup.append(dot);}
    if(settings.showLabels&&settings.method==='sectors'&&annotationsGroup){const labels=document.createElementNS(svg.namespaceURI,'g');labels.setAttribute('class','vastu-labels');const radius=Math.max(gridWidth,gridDepth)*.24;for(let i=0;i<8;i++){const a=i*Math.PI/4,nx=n[0],nz=n[1],x=settings.center[0]+radius*(nx*Math.cos(a)-nz*Math.sin(a)),y=settings.center[1]+radius*(nz*Math.cos(a)+nx*Math.sin(a));const t=document.createElementNS(svg.namespaceURI,'text');t.setAttribute('x',String(x));t.setAttribute('y',String(y));t.setAttribute('class','vastu-label');t.setAttribute('text-anchor','middle');t.textContent=sectorLabel(i);labels.append(t);}annotationsGroup.append(labels);}updateNote();
  }
  function updateControls() { const n=currentNorth()??[0,-1],orientedBounds=boundsCenter(data.polygon,n)??bboxCenter;const c=centerMode.value==='centroid'?(polygonCentroid(data.polygon)??orientedBounds):centerMode.value==='bounds'?orientedBounds:settings.center;settings.center=c;centerX.value=c[0].toFixed(2);centerZ.value=c[1].toFixed(2);const manual=centerMode.value==='manual';centerX.disabled=centerZ.disabled=!manual;redraw(); }
  centerMode.addEventListener('change',()=>{invalidateCopiedContext();updateControls();});method.addEventListener('change',()=>{invalidateCopiedContext();redraw();});[centerX,centerZ,opacity,showCenter,showLabels].forEach(el=>el.addEventListener('input',()=>{invalidateCopiedContext();redraw();}));[width,depth].forEach(el=>el.addEventListener('input',()=>{gridSizeEdited=true;invalidateCopiedContext();redraw();}));north.addEventListener('input',()=>{invalidateCopiedContext();const n=currentNorth()??[0,-1],m=orientationMetrics(n);width.placeholder=m.width.toFixed(2);depth.placeholder=m.depth.toFixed(2);if(!gridSizeEdited){width.value=m.width.toFixed(2);depth.value=m.depth.toFixed(2);}if(centerMode.value!=='manual')updateControls();else redraw();});
  fitGrid.addEventListener('click',()=>{const m=orientationMetrics(currentNorth()??[0,-1]);width.value=m.width.toFixed(2);depth.value=m.depth.toFixed(2);gridSizeEdited=true;invalidateCopiedContext();redraw();});
  reset.addEventListener('click',()=>{invalidateCopiedContext();centerMode.value='bounds';settings.center=settings.suggestedCenter??bboxCenter;north.value='0';updateControls();});
  let touchPoints=new Map<number,{x:number;y:number}>();
  let centerPointers=new Set<number>();
  let touchGesture:{distance:number;angle:number;width:number;depth:number;north:number}|undefined;
  function releasePointers(ids:Set<number>) { const captured=[...ids];ids.clear();for(const id of captured)if(svg?.hasPointerCapture(id))svg.releasePointerCapture(id); }
  function setAdjusting(next:boolean) { adjusting=next;adjustOverlay.setAttribute('aria-pressed',String(adjusting));adjustOverlay.textContent=adjusting?'Finish adjusting overlay':'Adjust overlay';adjustHelp.hidden=!adjusting;svg?.classList.toggle('vastu-touch-adjusting',adjusting);if(adjusting&&dragging){dragging=false;moveCenter.setAttribute('aria-pressed','false');moveCenter.textContent='Move center';releasePointers(centerPointers);}const capturedTouchPointers=new Set(touchPoints.keys());touchPoints.clear();releasePointers(capturedTouchPointers);touchGesture=undefined; }
  moveCenter.addEventListener('click',()=>{dragging=!dragging;if(dragging)setAdjusting(false);moveCenter.setAttribute('aria-pressed',String(dragging));moveCenter.textContent=dragging?'Finish moving center':'Move center';});
  adjustOverlay.addEventListener('click',()=>setAdjusting(!adjusting));
  function placeCenter(event: PointerEvent){if(!svg)return;const matrix=svg.getScreenCTM();if(!matrix)return;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const q=p.matrixTransform(matrix.inverse());settings.center=[q.x,q.y];centerMode.value='manual';centerX.disabled=centerZ.disabled=false;centerX.value=q.x.toFixed(2);centerZ.value=q.y.toFixed(2);redraw();}
  const gesturePair=()=>Array.from(touchPoints.values()).slice(0,2);
  const gestureMetrics=()=>{const [a,b]=gesturePair();if(!a||!b)return;return {distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),angle:Math.atan2(b.y-a.y,b.x-a.x)};};
  function finishTouchPointer(event:PointerEvent){if(!touchPoints.has(event.pointerId))return;touchPoints.delete(event.pointerId);touchGesture=undefined;if(svg?.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);}
  svg?.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'&&adjusting&&!dragging){event.preventDefault();event.stopImmediatePropagation();invalidateCopiedContext();touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});svg.setPointerCapture(event.pointerId);if(touchPoints.size===2){const m=gestureMetrics();if(m)touchGesture={...m,width:Math.max(.1,Number(width.value)||gridWidth),depth:Math.max(.1,Number(depth.value)||gridDepth),north:Number(north.value)||0};}return;}if(!dragging)return;event.preventDefault();event.stopImmediatePropagation();invalidateCopiedContext();centerPointers.add(event.pointerId);svg.setPointerCapture(event.pointerId);placeCenter(event);},{capture:true});
  svg?.addEventListener('pointermove',event=>{if(dragging&&svg.hasPointerCapture(event.pointerId)){event.preventDefault();event.stopImmediatePropagation();placeCenter(event);}},{capture:true});
  svg?.addEventListener('pointermove',event=>{if(!adjusting||event.pointerType!=='touch'||!touchPoints.has(event.pointerId))return;event.preventDefault();event.stopImmediatePropagation();touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});const m=gestureMetrics();if(!m||!touchGesture)return;const ratio=m.distance/touchGesture.distance;const delta=Math.atan2(Math.sin(m.angle-touchGesture.angle),Math.cos(m.angle-touchGesture.angle));if(method.value==='grid'){width.value=String(Math.max(.1,Math.min(100,touchGesture.width*ratio)).toFixed(2));depth.value=String(Math.max(.1,Math.min(100,touchGesture.depth*ratio)).toFixed(2));gridSizeEdited=true;}north.value=(touchGesture.north+delta*180/Math.PI).toFixed(1);invalidateCopiedContext();redraw();},{capture:true});
  svg?.addEventListener('pointerup',event=>{if(touchPoints.has(event.pointerId)){event.preventDefault();event.stopImmediatePropagation();finishTouchPointer(event);return;}if(centerPointers.has(event.pointerId)){event.preventDefault();event.stopImmediatePropagation();centerPointers.delete(event.pointerId);if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);}},{capture:true});
  svg?.addEventListener('pointercancel',event=>{if(touchPoints.has(event.pointerId)){event.preventDefault();event.stopImmediatePropagation();finishTouchPointer(event);return;}if(centerPointers.has(event.pointerId)){event.preventDefault();event.stopImmediatePropagation();centerPointers.delete(event.pointerId);if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);}},{capture:true});
  svg?.addEventListener('lostpointercapture',event=>{if(touchPoints.has(event.pointerId)){touchPoints.delete(event.pointerId);touchGesture=undefined;}centerPointers.delete(event.pointerId);},{capture:true});
  width.value=String(gridWidth.toFixed(2));depth.value=String(gridDepth.toFixed(2));updateControls();
  button.addEventListener('click',()=>{vastuEnabled=!vastuEnabled;button.setAttribute('aria-pressed',String(vastuEnabled));settingsPanel.hidden=!vastuEnabled;overlayGroup?.classList.toggle('vastu-off',!vastuEnabled);annotationsGroup?.classList.toggle('vastu-off',!vastuEnabled);note.hidden=!vastuEnabled;copy.hidden=!vastuEnabled;if(!vastuEnabled){setAdjusting(false);dragging=false;moveCenter.setAttribute('aria-pressed','false');moveCenter.textContent='Move center';releasePointers(centerPointers);fineTune.open=false;invalidateCopiedContext();}});
  copy.addEventListener('click', async () => {
    const context = makeVastuAgentContext(data, { scope: 'partial-room', viewSettings: settings });
    fallback.value = context; fallback.hidden = false;
    try {
      await navigator.clipboard.writeText(context);
      copy.textContent = 'Copy again';
      note.textContent = 'Review context copied locally; nothing was sent. The full text is shown below.';
    } catch {
      fallback.focus(); fallback.select();
      note.textContent = 'Clipboard access is unavailable. The complete review context is shown below for manual copying.';
    }
  });
  toolbar.append(button, settingsPanel, copy, note); plan.prepend(toolbar); plan.append(fallback);
}

function sectorLabel(index: number) { return ['N','NE','E','SE','S','SW','W','NW'][index]; }

function mode(next: boolean) {
  inPlan=next;plan.hidden=!next;canvas.hidden=next;overlay?.setVisible(!next);
  document.querySelector('#model-view')!.setAttribute('aria-pressed',String(!next));
  document.querySelector('#plan-view')!.setAttribute('aria-pressed',String(next));
  const url=new URL(location.href);url.searchParams.set('view',next?'layout':'3d');history.replaceState(null,'',url);
  render();
}
document.querySelector('#model-view')!.addEventListener('click',()=>mode(false));
document.querySelector('#plan-view')!.addEventListener('click',()=>mode(true));
document.querySelector<HTMLInputElement>('#room-file')!.addEventListener('change',async event=>{
  const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;
  try { if(file.size>20_000_000)throw new Error('Choose a room JSON smaller than 20 MB.');show(JSON.parse(await file.text()),file.name); }
  catch(error) { status.textContent=error instanceof Error?error.message:String(error); }
  finally { input.value=''; }
});
new ResizeObserver(()=>{
  camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth,host.clientHeight);render();
}).observe(host);

// Local development can open an ignored derived file without copying it into public assets.
if(import.meta.env.DEV) {
  const path=new URLSearchParams(location.search).get('data');
  if(path) {
    try {
      const url=new URL(path,location.href);if(url.origin!==location.origin)throw new Error('Use a local room JSON.');
      const response=await fetch(url);if(!response.ok)throw new Error('The local room JSON could not load.');
      show(await response.json(),'Your scan');
    } catch(error) { status.textContent=error instanceof Error?error.message:String(error); }
  }
}
mode(new URLSearchParams(location.search).get('view')==='layout');
