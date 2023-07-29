import { useEffect, useState } from 'react';
import { useFetcher } from '@remix-run/react';
import type { DateForm, DayEvent, niceDay } from '../../common/types';

export const CalendarModal: React.FC<{
  accessToken: string,
  modalDisplay: {i: number, fulldate: string, day_events: DayEvent[]},
  setCurMonth: any,
  setModalDisplay: any
}> = ({ accessToken, modalDisplay, setCurMonth, setModalDisplay }) => {
  
  const addEvent = useFetcher();

  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  
  const niceDay: niceDay = {
    year: modalDisplay.fulldate?.substring(0,4),
    month: modalDisplay.fulldate?.substring(4,6), 
    niceMonth: months[Number(modalDisplay.fulldate?.substring(4,6))-1], 
    date: modalDisplay.fulldate?.substring(6,8), 
    full: new Date(modalDisplay.fulldate?.substring(4,6)+"-"+modalDisplay.fulldate?.substring(6,8)+"-"+modalDisplay.fulldate?.substring(0,4))
  };

  const [ newEvent, setNewEvent ] = useState<DateForm>({
    event_title: "",
    event_details: "",
    start_month: niceDay.niceMonth, 
    start_month_numeric: niceDay.month,
    start_date: niceDay.date, 
    start_year: niceDay.year,
    start_hour: "12",
    start_minute: "00",
    start_ampm: "PM", 
    end_month_numeric: niceDay.month,
    end_month: niceDay.niceMonth, 
    end_date: niceDay.date, 
    end_year: niceDay.year,
    end_hour: "1", 
    end_minute: "00", 
    end_ampm: "PM"
  })

  useEffect(() => {
    console.log(addEvent)
    if(addEvent.data?.deletedEvent?.error) {
      console.log("Something went wrong with deletion");
    }
    if(addEvent.data?.deletedEvent?.dbId) {
      setModalDisplay((prev: any) => {
        const filteredEvents = prev.day_events
          .filter((event: DayEvent) => event._id !== addEvent.data?.deletedEvent?.dbId);
          return {...prev, day_events: filteredEvents};
      })
      // setCurMonth((prev: any) => {
      //   console.log(prev.monthArr);
      //   const filtered = prev.monthArr?.map((day:any) =>
      //     day.day_events?.map((event:any)=> {
      //       if(event._id===addEvent.data?.deletedEvent?.dbId) {
      //         console.log("FOUND THE MATCH TO REMOVE!",event);
      //         return;
      //       } else {
      //         console.log("FOUND ONE TO KEEP!",event);
      //         return event;
      //       }
      //     })
      //   )
      //   console.log("OLD!",prev);
      //   console.log("NEW!",{...prev, monthArr: filtered});
      //   return {...prev, monthArr: filtered};
      // })
    }
  },[addEvent])

  const submitForm = () => {
    addEvent.submit(
      { 
        newEvent: JSON.stringify(newEvent),
        accessToken
      },
      { method: "post", action: `/api/calendar/create?index` }
    );
  }

  const deleteEvent = (dbId:string, gId:string) => {
    addEvent.submit(
      { 
        deleteDbId: dbId,
        deleteGId: gId,
        accessToken
      },
      { method: "post", action: `/api/calendar/delete?index` }
    );
  } 

  const updateForm = (e:any) => {
    setNewEvent({...newEvent, [e.target.name]: e.target.value})
  }

  const printOptions = (
    length:number, 
    start: number, 
    padLeft: boolean, 
    wordArr?: string[] | null
  ) => {
    return (
      wordArr
      ?Array.apply(null, Array(length))
        .map((_num:unknown, i:number) => <option key={`${Math.floor(Math.random()*10000)}__${i}`}>{wordArr[i+start]}</option>)
        :padLeft
          ?Array.apply(null, Array(length))
            .map((_num:unknown, i:number) => <option key={`${Math.floor(Math.random()*10000)}__${i}`}>{(i+start).toString().padStart(2,'0')}</option>)
          :Array.apply(null, Array(length))
            .map((_num:unknown, i:number) => <option key={`${Math.floor(Math.random()*10000)}__${i}`}>{i+start}</option>)
    )
  }
    
  return (
    <div className="calendar calendar__modal">
        <div className="calendar__header">
            {niceDay.full.toLocaleDateString([], {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            })} 
            <div onClick={() => setModalDisplay(null)} className="calendar__header--close">+</div>
        </div>
        <div className="calendar__appointments">
            {modalDisplay.day_events?.length>0
              ?modalDisplay.day_events
                .sort((a: DayEvent,b: DayEvent) => 
                  Number(a.start_time_string) - Number(b.start_time_string)
                )?.map((event: DayEvent) => (
                  <div className="calendar__appointments__ind" key={event._id}>
                    <div className="calendar__appointments__ind--time">
                      <>{event.start_time_formatted} - {event.end_time_formatted}</>
                    </div>
                    <div className="calendar__appointments__ind--event">
                      <div className="calendar__appointments__ind--event--title">{event.event_title}</div>
                      <div className="calendar__appointments__ind--event--details">{event.event_details||""}</div>
                      <button onClick={() => deleteEvent(event._id, event.gId)}>Delete</button>
                    </div>
                  </div>
            )):"No events for this date."}
        </div>
        <div className="calendar__form">
            {/* {addForm?<> */}
            <input className="calendar__form--field--full-width" name="event_title" type="text" placeholder="Event Title" value={newEvent.event_title} onChange={updateForm} />
            <textarea className="calendar__form--field--full-width" name="event_details" placeholder="Event Details" value={newEvent.event_details} onChange={updateForm} />
            <div className="calendar__form--field--start-end-group">
                <div className="calendar__form--field--start-end-group--label">Start Time</div>
                <select className="calendar__form--field" name="start_hour" value={newEvent.start_hour} onChange={updateForm} >
                  {printOptions(12,1,false)}
                </select>
                :
                <select className="calendar__form--field" name="start_minute" value={newEvent.start_minute} onChange={updateForm} >
                  {printOptions(60,0,true)}
                </select>     
                <select className="calendar__form--field" name="start_ampm" value={newEvent.start_ampm} onChange={updateForm} >
                    <option>AM</option>
                    <option>PM</option>
                </select>
            </div>
            <div className="calendar__form--field--start-end-group">
                <div className="calendar__form--field--start-end-group--label">End Date / Time</div>
                <select className="calendar__form--field" name="end_month" value={newEvent.end_month} onChange={updateForm} >
                  {printOptions(12,0,false,months)}
                </select>
                <select className="calendar__form--field" name="end_date" value={newEvent.end_date} onChange={updateForm} >
                  {printOptions(31,1,false)}
                </select>
                <select className="calendar__form--field" name="end_year" value={newEvent.end_year} onChange={updateForm} >
                  {printOptions(5,Number(new Date().getFullYear()),false)}
                </select>
                <select className="calendar__form--field" name="end_hour" value={newEvent.end_hour} onChange={updateForm} >
                  {printOptions(12,1,false)}
                </select>
                :
                <select className="calendar__form--field" name="end_minute" value={newEvent.end_minute} onChange={updateForm} >
                  {printOptions(60,0,true)}
                </select>     
                <select className="calendar__form--field" name="end_ampm" value={newEvent.end_ampm} onChange={updateForm} >
                    <option>AM</option>
                    <option>PM</option>
                </select>
            </div>
            <div className="calendar__form--submit" onClick={submitForm}>SUBMIT</div>
            {/* <div className="calendar__form--addEvent">+</div> */}
        </div>
    </div>
  )
}