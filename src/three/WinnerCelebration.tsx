import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Group, InstancedMesh, Object3D } from 'three';
import type { ScenePlayer } from '../components/PokerScene';
import { seatPosition } from './seating';

/** Deterministic, short-lived celebration shared by all viewers of the award. */
export function WinnerCelebration({players, at, now}: {players:ScenePlayer[]; at:number; now?:number}) {
  const confetti = useRef<InstancedMesh>(null);
  const balloons = useRef<Group>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const count = 120;
  const positions = players.map(p => seatPosition(p.seat ?? 0,12).position);
  useEffect(() => {
    if (!confetti.current) return;
    const colors = ['#f3cb69','#f28b82','#7fcbbb','#faf0d0'];
    for(let i=0;i<count;i++) confetti.current.setColorAt(i,new Color(colors[i%4]));
    if(confetti.current.instanceColor) confetti.current.instanceColor.needsUpdate=true;
  },[]);
  useFrame(() => {
    const t = Math.max(0, ((now ?? Date.now())-at)/1000);
    if (!confetti.current || !positions.length) return;
    for(let i=0;i<count;i++) {
      const p=positions[i%positions.length], angle=i*2.39996, spread=0.25+t*(0.15+(i%7)*0.04);
      dummy.position.set(p[0]+Math.cos(angle)*spread, 3.6+(i%11)*0.10+t*0.35-t*t*0.16,p[2]+Math.sin(angle)*spread);
      dummy.rotation.set(t*2+i,t*3+i*.2,t*1.7);
      dummy.scale.setScalar(Math.min(1,t*4)*Math.max(0,Math.min(1,(4.2-t)*2)));
      dummy.updateMatrix(); confetti.current.setMatrixAt(i,dummy.matrix);
    }
    confetti.current.instanceMatrix.needsUpdate=true;
    if(balloons.current) balloons.current.position.y=t*.35;
  });
  return <group>
    <instancedMesh ref={confetti} args={[undefined,undefined,count]} frustumCulled={false}>
      <planeGeometry args={[.075,.035]}/><meshBasicMaterial side={2} toneMapped={false}/>
    </instancedMesh>
    <group ref={balloons}>{positions.flatMap((p,i)=>[-1,1].map(side=><group key={`${i}:${side}`} position={[p[0]+side*.7,3.5,p[2]-.2]}>
      <mesh scale={[.18,.23,.18]}><sphereGeometry args={[1,12,10]}/><meshStandardMaterial color={side===1?'#ddbf68':'#65bfa7'} roughness={.35}/></mesh>
      <mesh position={[0,-.42,0]}><cylinderGeometry args={[.004,.004,.48,4]}/><meshBasicMaterial color="#e4ddc5"/></mesh>
    </group>))}</group>
  </group>;
}
