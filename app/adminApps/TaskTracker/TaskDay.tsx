import type { Job } from "~/common/types"

export const TaskDay: React.FC<{
  activeJob: Job,
  goal: number,
  initDt: string,
  initMo: string,
  initYr: number,
  offset: number,
}> = ({ activeJob, goal, initDt, initMo, initYr, offset }) => {

  const minus: (current: number, days: number) => `${number|string}-${number|string}-${number|string}` = (current: number, days: number) => {
    const ts = current-(days*(24*60*60*1000));
    return `${new Date(ts).getDate().toString().padStart(2,"0")}-${(new Date(ts).getMonth()+1).toString().padStart(2,"0")}-${new Date(ts).getFullYear()}`;
  }

  const dayArray = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const moArray = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const curStamp = (Date.parse(`${initYr}-${initMo}-${initDt}T00:00:00`)-(offset*(24*60*60*1000)));
  const thisDate = new Date(curStamp);
  const dailiesDate: `${number|string}-${number|string}-${number|string}` = `${thisDate.getDate().toString().padStart(2,"0")}-${(thisDate.getMonth()+1).toString().padStart(2,"0")}-${thisDate.getFullYear()}`;

  let wordsForDay = 0;
  let dayTotalWordCount = activeJob.dailies[dailiesDate]||0;
  let failSafe = 0;
  let lastCount: string | number = 0;
  let daySuccess = 0;
  if(dayTotalWordCount) {
    while(!lastCount) {
      lastCount = Number(activeJob.dailies[minus(curStamp, failSafe+1)]);
      failSafe++;
      if(failSafe>14) {
        lastCount = "x";
      }
    }
    dayTotalWordCount = `${Number(dayTotalWordCount)||0}`;
    lastCount = lastCount==="x"?0:lastCount;
    wordsForDay = Number(dayTotalWordCount)-Number(lastCount);
    daySuccess = (wordsForDay/goal*100)
  }
  return (
    <div className="task-day">
      <div className="task-day__visual">
        <div className="task-day__status-bar" style={{height: (daySuccess>0?daySuccess:0)+"%"}} />
        <div className="task-day__status-bar--green" style={{height: (daySuccess>0?daySuccess:0)+"%", opacity: daySuccess/100}} />
        {Array.apply(null, Array(9)).map((_num:unknown, i:number) =>
          <div key={`graphLine-${dailiesDate}-${i}`} className="task-day__graph-line" style={{top: `${(i+1)*10}%`}} />
        )}
      </div>
      <div className="task-day__desc">
        <div style={{fontWeight: "bold"}}>{wordsForDay>=0?wordsForDay:0} {activeJob.units}</div>
        {`${dayArray[thisDate.getDay()]}, \n\r ${thisDate.getDate()} ${moArray[thisDate.getMonth()]}`}
      </div>
    </div>
  )
}