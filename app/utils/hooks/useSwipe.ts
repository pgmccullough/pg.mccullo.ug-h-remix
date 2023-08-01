import { useState } from "react";

export const useSwipe: any = (resetInterval = null) => {
  const [ touchStart, setTouchStart ] = useState<number|null>(null);
  const [ touchEnd, setTouchEnd ] = useState<number|null>(null);
  const [ touchDistance, setTouchDistance ] = useState<number>(0);
  const onTouchStart = (e: any) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }
  const onTouchMove = (e: any) => {
    if(touchStart) {
      setTouchDistance(touchStart - e.targetTouches[0].clientX)
      setTouchEnd(e.targetTouches[0].clientX)
    }
  };
  const onTouchEnd = (leftFn: () => void, rightFn: () => void) => {
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
  const chooseTouch = (pos: "start"|"move"|"end"|"distance") => {
    switch(pos) {
      case "start":
        return onTouchStart;
      case "move":
        return onTouchMove;
      case "end":
        return onTouchEnd;
      case "distance":
        return setTouchDistance;
      default:
        return;
    } 
  }

  return [touchDistance, chooseTouch];
}

