import { useState } from "react";

export const useSwipe: any = (leftFn:any, rightFn:any) => {
  const [ endFunctions ] = useState({left: leftFn, right: rightFn});
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
  const onTouchEnd = (e: any) => {
    if (!touchStart || !touchEnd) return
    setTouchDistance(0);
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > 150
    const isRightSwipe = distance < -150
    if (isLeftSwipe) {
      endFunctions.left();
    } else if(isRightSwipe) {
      endFunctions.right();
    }
  }
  const chooseTouch = (e:any) => {
    switch(e.type) {
      case "touchstart":
        onTouchStart(e);
        break;
      case "touchmove":
        onTouchMove(e);
        break;
      case "touchend":
        onTouchEnd(e);
        break;
      default:
        return setTouchDistance;
    } 
  }
  return [touchDistance, chooseTouch];
}

