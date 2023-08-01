import { useState } from "react";
import type { TouchEvent } from "react";

export const useSwipe: (
  (leftFn: () => void, rightFn: () => void) => [
    number,
    ((e: TouchEvent<HTMLDivElement>) => React.Dispatch<React.SetStateAction<number>> | undefined)
  ]
) = (leftFn:any, rightFn:any) => {
  const [ touchStart, setTouchStart ] = useState<number|null>(null);
  const [ touchEnd, setTouchEnd ] = useState<number|null>(null);
  const [ touchDistance, setTouchDistance ] = useState<number>(0);

  const onTouchStart = (e: TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }
  const onTouchMove = (e: TouchEvent) => {
    if(touchStart) {
      setTouchDistance(touchStart - e.targetTouches[0].clientX)
      setTouchEnd(e.targetTouches[0].clientX)
    }
  };
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    setTouchDistance(0);
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > 150
    const isRightSwipe = distance < -150
    if (isLeftSwipe) {
      leftFn();
    } else if(isRightSwipe) {
      rightFn();
    }
  }
  const chooseTouch = (e:TouchEvent) => {
    switch(e.type) {
      case "touchstart":
        onTouchStart(e);
        break;
      case "touchmove":
        onTouchMove(e);
        break;
      case "touchend":
        onTouchEnd();
        break;
      default:
        return setTouchDistance;
    } 
  }
  return [touchDistance, chooseTouch];
}

