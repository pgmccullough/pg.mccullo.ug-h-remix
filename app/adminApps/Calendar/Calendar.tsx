import { useFetcher, useLoaderData } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { useSwipe } from '~/utils/hooks/useSwipe';
import { CalendarModal } from './CalendarModal';
import type { DayEvent, DBEvent, month, GoogleEvent } from '../../common/types';

export const Calendar: React.FC<{}> = () => {

  let { calDates } = useLoaderData();

  const saveGoogleEvents = useFetcher();
  
  const yearNow = new Date().getFullYear();
  const monthNow = (new Date().getMonth()+1).toString().padStart(2,'0');
  const dateNow = (new Date().getDate()).toString().padStart(2,'0');

  const buildMonthArray = (year: number, month: number, date: number) => {
    const monthArr:any[] = [];
    for(let i=1; i <= new Date(year, month, 0).getDate(); i++) {
      const day_events:string[] = [];
      const fulldate = year+month.toString().padStart(2,'0')+i.toString().padStart(2,'0');
      calDates.map((event:any) => {
        if(event.datesArr?.includes(fulldate)) {
          day_events.push(event);
        }
      })
      monthArr.push({i,fulldate,day_events});
    }
    return monthArr;
  }

  const [ swipe, setSwipe ] = useSwipe(() => changeMonth("next"), () => changeMonth("prev"));
  const [ calendarNotif, setCalendarNotif ] = useState<{
    active: boolean, message: string, completed: boolean
  }>({active: false, message: "", completed: false})
  const [ modalDisplay, setModalDisplay ] = useState<DayEvent|null|any>(null)
  const [ curMonth, setCurMonth ] = useState<month>({
    curDate: yearNow+monthNow+dateNow,
    firstDay: new Date(yearNow, Number(monthNow)-1, 1).getDay(),
    prevMonth: Number(monthNow)-1,
    prevYear: monthNow==="01"?yearNow-1:yearNow,
    nextMonth: Number(monthNow)+1,
    nextYear: monthNow==="12"?yearNow+1:yearNow,
    monthName: new Date(yearNow, Number(monthNow)-1, 1).toLocaleString('default', { month: 'long' }),
    monthArr: buildMonthArray(yearNow,Number(monthNow),1),
    year: yearNow
  });

  const [ gSyncLink, setGSyncLink ] = useState<string>("");

  const [ accessToken, setAccessToken ] = useState<string>("");

  const scrapeGoogleCal = async (token: string) => {
    try {
      const rawData = await fetch(`https://www.googleapis.com/calendar/v3/calendars/patrick.g.mccullough@gmail.com/events?access_token=${token}`);
      const calendarData = await rawData.json();
      const { items } = calendarData;
      const dbEvents: DBEvent[] = [];
      items.forEach((item: GoogleEvent) => {
        const startDate = item.start.dateTime?.split("T")[0]?.split("-")||item.start.date?.split("-");
        const startTimeArr = item.start.dateTime?.split("T")[1]?.split(":")||["12","00"];
        const start_time_string = startTimeArr[0]+startTimeArr[1];
        const start_time_formatted = `${Number(startTimeArr[0]) > 12?Number(startTimeArr[0])-12:Number(startTimeArr[0])}:${startTimeArr[1]} ${Number(startTimeArr[0]) >= 12?" PM":" AM"}`
        const endDate = item.end.dateTime?.split("T")[0]?.split("-")||item.end.date?.split("-");
        const endTimeArr = item.end.dateTime?.split("T")[1]?.split(":")||["12","00"];
        const end_time_string = endTimeArr[0]+endTimeArr[1];
        const end_time_formatted = `${Number(endTimeArr[0]) > 12?Number(endTimeArr[0])-12:Number(endTimeArr[0])}:${endTimeArr[1]} ${Number(endTimeArr[0]) >= 12?" PM":" AM"}`;
        let datesArr = [startDate[0]+startDate[1]+startDate[2]];
        let noInfinite = 0;
        if(startDate) {
          while(startDate[0]!==endDate[0]&&startDate[1]!==endDate[1]&&startDate[2]!==endDate[2]&&noInfinite<100) {
            noInfinite++;
            if(Number(startDate[2]) >= 31) {
              startDate[2] = "01";
              if(Number(startDate[1]) === 12) {
                startDate[1] = "01";
                startDate[0] = (Number(startDate[0])+1).toString();
              } else {
                startDate[1] = (Number(startDate[1])+1).toString().padStart(2,'0');
              }
            } else {
            startDate[2] = (Number(startDate[2])+1).toString()
            }
            datesArr.push(startDate[0]+startDate[1]+startDate[2])
          }
          const dbEvent = {
            event_title: item.summary,
            event_details: item.location,
            datesArr,
            start_time_string,
            start_time_formatted,
            end_time_formatted,
            end_time_string,
            gId: item.id
          }
          dbEvents.push(dbEvent);
        } else {
          console.error(item);
        }
      })
      setCalendarNotif({active: true, message: "Syncing with Google", completed: false})
      saveGoogleEvents.submit(
        { events: JSON.stringify(dbEvents) },
        { method: "post", action: `/api/calendar?index` }
      );
    } catch(err) {
      setCalendarNotif({active: true, message: "Unable to sync", completed: true})
      localStorage.removeItem("gcal");
      setGSyncLink("https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/calendar&include_granted_scopes=true&response_type=token&state=unused&redirect_uri=https%3A//pg.mccullo.ug/h&client_id=663051266767-jjl8shsljmqonrvvb74k6g5p9ejppv5e.apps.googleusercontent.com")
    }
  }

  useEffect(() => {
    if(!(JSON.parse(localStorage.getItem("gcal")!)?.expTime>Math.floor(new Date().getTime() / 1000)&&gSyncLink==="/h/#gsync")) {
      setGSyncLink(localStorage.getItem("gcal")&&JSON.parse(localStorage.getItem("gcal")!)?.expTime>Math.floor(new Date().getTime() / 1000)?"/h/#gsync":"https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/calendar&include_granted_scopes=true&response_type=token&state=unused&redirect_uri=https%3A//pg.mccullo.ug/h&client_id=663051266767-jjl8shsljmqonrvvb74k6g5p9ejppv5e.apps.googleusercontent.com")
      let tokenCheck = window.location.hash.split("&");
      const paramObject: {[key: string]: string} = {};
      tokenCheck.forEach(keyVal => {paramObject[keyVal.split("=")[0]] = keyVal.split("=")[1]})
      if(paramObject.access_token) {
        setAccessToken(paramObject.access_token);
        scrapeGoogleCal(paramObject.access_token);
        const expTime = Number(paramObject.expires_in) + Math.floor(new Date().getTime() / 1000);
        const token = paramObject.access_token
        localStorage.setItem("gcal",JSON.stringify({expTime,token}));
        history.replaceState(null, "", window.location.origin+window.location.pathname);
      }
      if(window.location.hash==="#gsync") {
        setAccessToken(localStorage.getItem("gcal")&&JSON.parse(localStorage.getItem("gcal")!).token);
        scrapeGoogleCal(localStorage.getItem("gcal")&&JSON.parse(localStorage.getItem("gcal")!).token);
        history.replaceState(null, "", window.location.origin+window.location.pathname);
      }
    }
  },[gSyncLink])

  useEffect(() => {
    setAccessToken(localStorage.getItem("gcal")&&JSON.parse(localStorage.getItem("gcal")!).token);
  },[])

  useEffect(() => {
    if(calendarNotif.completed) {
      setTimeout(() => {
        setCalendarNotif({...calendarNotif, active: false, completed: false})
      },2000)
    };
  },[calendarNotif])

  useEffect(() => {
    if(saveGoogleEvents.type==="done") {
      setCalendarNotif({active: true, message: `Succesfully updated ${saveGoogleEvents.data.events.updated} events, created ${saveGoogleEvents.data.events.added} events`, completed: true})
    }
  },[saveGoogleEvents])

  const changeMonth = (dir: "next"|"prev") => {
    setCurMonth(prev => {
      let yearNow;
      let monthNow;
      switch(dir) {
        case "next":
          yearNow = prev.nextYear;
          monthNow = prev.nextMonth;
          break;
        case "prev":
          yearNow = prev.prevYear;
          monthNow = prev.prevMonth;
      }
      return {
        curDate: prev.curDate,
        firstDay: new Date(yearNow, Number(monthNow)-1, 1).getDay(),
        prevMonth: Number(monthNow)===1?12:monthNow-1,
        prevYear: Number(monthNow)===1?yearNow-1:yearNow,
        nextMonth: Number(monthNow)===12?1:monthNow+1,
        nextYear: monthNow===12?yearNow+1:yearNow,
        monthName: new Date(yearNow, Number(monthNow)-1, 1).toLocaleString('default', { month: 'long' }),
        monthArr: buildMonthArray(yearNow,monthNow,1),
        year: yearNow      
      }
    })
  }
  
  return (
    <>
    <article className="postcard--left">
      <div className="postcard__time">
        <div className="postcard__time__link--unlink">
          Calendar
        </div>
      </div>
      <div className="postcard__content calendar__content">
        <div className="postcard__content__media" />
        <div className="postcard__content__text">
          <div className="calendar"
            style={{transform: `translateX(${swipe*-1}px`}}
            onTouchStart={setSwipe} 
            onTouchMove={setSwipe} 
            onTouchEnd={setSwipe}
          >
            {modalDisplay
              ?<CalendarModal 
                accessToken={accessToken}
                modalDisplay={modalDisplay}
                setCurMonth={setCurMonth}
                setCalendarNotif={setCalendarNotif}
                setModalDisplay={setModalDisplay}
              />
              :""
            }
            <div className="calendar__header">
              <div className="calendar__headGroup" />
              <div className="calendar__headGroup calendar__headGroup--center">
                <div onClick={() => changeMonth("prev")} className="calendar__header--previous">^</div>
                <div className="calendar__header--current">{curMonth.monthName} {curMonth.year}</div>
                <div onClick={() => changeMonth("next")} className="calendar__header--next">^</div>
              </div>
              <div className="calendar__headGroup calendar__headGroup--right">
                <a href={gSyncLink} onClick={(e) => {
                  if(gSyncLink==="/h/#gsync") {
                    e.preventDefault();
                    scrapeGoogleCal(localStorage.getItem("gcal")&&JSON.parse(localStorage.getItem("gcal")!).token);
                  }
                }}>
                  <button className="postcard__time__option calendar__sync">
                    <img className="calendar__googleLogo" src="/googlelogo.svg" /> Sync
                  </button>
                </a>
              </div>
            </div>
            <div className="calendar__days">
              <div className="calendar__days--day">Sun</div>
              <div className="calendar__days--day">Mon</div>
              <div className="calendar__days--day">Tue</div>
              <div className="calendar__days--day">Wed</div>
              <div className="calendar__days--day">Thu</div>
              <div className="calendar__days--day">Fri</div>
              <div className="calendar__days--day">Sat</div>
            </div>
            <div className="calendar__dates">
              {curMonth?.monthArr?.map((dateBlock:{i:number, fulldate:string, day_events: string[]}) =>                                 
                <div 
                  key={dateBlock.i} 
                  onClick={() => setModalDisplay(dateBlock)} 
                  id={dateBlock?.fulldate}
                  className={`calendar__dates__block${curMonth.curDate===dateBlock?.fulldate?"--current":""}`} 
                  style={dateBlock.i===1?{gridColumn: curMonth.firstDay+1}:{}}
                >
                  <div className="calendar__dates__block--label">
                    {dateBlock.i}
                  </div>
                  {dateBlock.day_events?.length
                    ?<div className="calendar__dates__block--count">
                      {dateBlock.day_events?.length}
                    </div>
                    :""
                  }  
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={`calendar__notif ${calendarNotif.active&&" calendar__notif--active"}`}>
          <div className="loader" /> <p>{calendarNotif.message}</p>
        </div>
      </div>
    </article>
  </>
  )
}