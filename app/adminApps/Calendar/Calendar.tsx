import { useLoaderData } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { month } from '../../common/types';

export const Calendar: React.FC<{}> = () => {

  let { calDates } = useLoaderData(); 

  const year = new Date().getFullYear();
  const month = new Date().getMonth()+1;
  const day_events:any[] = [];
  const monthArr:any[] = [];

  for(let i=1; i <= new Date(year, month, 0).getDate(); i++) {
    const fulldate = year+(new Date(year, month-1, 1).getMonth()+1).toString().padStart(2, '0')+i.toString().padStart(2, '0');
    calDates.map((event:any) => {
      if(event.datesArr.includes(fulldate)) {
        day_events.push(event.event_title);
      }
    })
    monthArr.push({i,fulldate,day_events});
  }
  console.log(monthArr);
    
  const [curMonth, setCurMonth] = useState<month>({
    curDate: "20230726",
    firstDay: new Date(2023, 7-1, 1).getDay(),
    prevMonth: 6,
    prevYear: 2023,
    nextMonth: 8,
    nextYear: 2023,
    monthName: "July",
    monthArr,
    year: 2023
  });
  
  return (
    <>
      <article className="postcard--left">
        <div className="postcard__time">
          <div className="postcard__time__link--unlink">
            Calendar
          </div>
        </div>
        <div className="postcard__content">
          <div className="postcard__content__media" />
          <div className="postcard__content__text">
            <div className="calendar">
              <div className="calendar__header">
                <div onClick={() => {console.log("prev")}} className="calendar__header--previous">&lt;</div>
                <div className="calendar__header--current">{curMonth.monthName}, {curMonth.year}</div>
                <div onClick={() => {console.log("next")}} className="calendar__header--next">&gt;</div>
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
                {curMonth?.monthArr.map((dateBlock:any) =>                                 
                  <div 
                    key={`xx_${dateBlock.i}`} 
                    onClick={() => {console.log(dateBlock.fulldate)}} 
                    id={dateBlock.fulldate}
                    className={`calendar__dates__block${curMonth.curDate===dateBlock.fulldate?"--current":""}`} 
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
        </div>
      </article>
    </>
  )
}