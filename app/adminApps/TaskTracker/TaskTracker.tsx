import { ChangeEvent, ChangeEventHandler, useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { Job } from "~/common/types";


export const TaskTracker: React.FC<{}> = () => {

  const { jobs } = useLoaderData();

  const taskFetch = useFetcher();

  const initDt = (new Date().getDate()).toString().padStart(2,"0");
  const initMo = (new Date().getMonth()+1).toString().padStart(2,"0");
  const initYr = new Date().getFullYear();

  const [ jobList, setJobList ] = useState<Job[]>(jobs.filter((job:Job) => !job.archive));
  const [ activeJob, setActiveJob ] = useState<Job>(jobs.filter((job:Job) => !job.archive)[0]);
  const [ formActive, setFormActive ] = useState<boolean>(false)
  const [ newJob, setNewJob ] = useState<Job>({
    _id: '',
    title: '',
    deadline: `${initMo}/${initDt}/${initYr}`,
    month: initMo,
    date: initDt,
    year: `${initYr}`,
    totalCount: '',
    units: '',
    url: [{title: "", url: ""}],
    curCount: '0',
    dailies: {},
    notes: [],
    order: jobs.length+1,
    archive: false
  })

  const timeDiff: any = (deadlineTime: number, nowTime: number, measure: string = "days") => {
    const diffObj = {
      seconds: 0,
      minutes: 0,
      hours: 0,
      days: 0,
      weeks: 0,
      months: 0,
    };
    diffObj.seconds = ((deadlineTime/1000) - (nowTime/1000))
    diffObj.minutes = diffObj.seconds/60;
    diffObj.hours = diffObj.minutes/60;
    diffObj.days = diffObj.hours/24;
    diffObj.weeks = diffObj.days/7;
    diffObj.months = diffObj.days/30;
    return diffObj[measure as keyof typeof diffObj];
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

  const updateForm = (e: ChangeEvent<HTMLInputElement|HTMLSelectElement>) => {
    if(e.target.dataset?.index) {
      let cleanName = e.target.name.slice(3).toLowerCase();
      let urlArrayClone = [...newJob.url]
      urlArrayClone.splice(Number(e.target.dataset.index),1,{...urlArrayClone[Number(e.target.dataset.index)], [cleanName]: e.target.value})
      setNewJob({...newJob, url: urlArrayClone})
    } else {
      if(e.target.name==="month"||e.target.name==="date"||e.target.name==="year") {
        const updateDate = `${(e.target.name==="month"?e.target.value:newJob.month)}/${(e.target.name==="date"?e.target.value:newJob.date)}/${Number(e.target.name==="year"?e.target.value:newJob.year)}`;
        return setNewJob({...newJob, [e.target.name]: e.target.value, deadline: updateDate})  
      }
      if(e.target.name==="title") {
        const targetJob = [...jobList].find((job: Job) => !job._id);
        const otherJobs = [...jobList].filter((job: Job) => !!job._id);
        targetJob!.title = e.target.value;
        setJobList([...otherJobs!, targetJob!]);
      }
      setNewJob({...newJob, [e.target.name]: e.target.value})
    }
  }

  const updateCurrent = (e: ChangeEvent<HTMLInputElement>) => {
    setActiveJob({...activeJob, curCount: `${Number(e.target.value)}`});
  }

  const clickNew = () => {
    setFormActive(true);
    if(!jobList.find((job:Job) => job._id === "")) {
      setJobList([...jobList, newJob]);
      setActiveJob(newJob);
    }
  }

  const blurForm = (job: Job) => {
    setActiveJob(job);
    setFormActive(false);
    setJobList([...jobList].filter((item: Job) => item._id));
  }

  useEffect(() => {
    if(taskFetch.data?.archived?.archivedId) {
      setJobList([...jobList].filter((job: Job) => job._id !== taskFetch.data?.archived?.archivedId));
      setActiveJob([...jobList].filter((job: Job) => job._id !== taskFetch.data?.archived?.archivedId)[0]);
    }
    if(taskFetch.data?.deleted?.deletedId) {
      setJobList([...jobList].filter((job: Job) => job._id !== taskFetch.data?.deleted?.deletedId));
      setActiveJob([...jobList].filter((job: Job) => job._id !== taskFetch.data?.deleted?.deletedId)[0]);
    }
    if(taskFetch.data?.task?.insertedId) {
      const targetJob = [...jobList].find((job: Job) => !job._id);
      const otherJobs = [...jobList].filter((job: Job) => !!job._id);
      if(targetJob) {
        targetJob!._id = taskFetch.data.task.insertedId;
        setJobList([...otherJobs!, targetJob!]);
        setActiveJob(targetJob!);
      }
    }
  },[ taskFetch ])

  const addTask = () => {
    taskFetch.submit(
      { taskAction: "addTask", taskObj: JSON.stringify(newJob) },
      { method: "post", action: `/api/task?index` }
    );
  }

  const archiveTask = (job: Job) => {
    taskFetch.submit(
      { taskAction: "archiveTask", taskObj: JSON.stringify(job) },
      { method: "post", action: `/api/task?index` }
    );
  }

  const updateTask = (job: Job) => {
    taskFetch.submit(
      { taskAction: "updateTask", taskObj: JSON.stringify(job) },
      { method: "post", action: `/api/task?index` }
    );    
  }

  const deleteTask = (job: Job) => {
    taskFetch.submit(
      { taskAction: "deleteTask", taskObj: JSON.stringify(job) },
      { method: "post", action: `/api/task?index` }
    );    
  }

  return (
    <>
      <article className="postcard--left">
        <div className="postcard__time">
          <div className="postcard__time__link--unlink">
            Task Tracker
          </div>
        </div>
        <div className="postcard__content">
          <div className="postcard__content__media"/>
          <div className="task-tracker">
          <div className="note__titles">
              {jobList.map(job =>
                <div 
                  key={job._id} 
                  onClick={() => blurForm(job)} 
                  className={`note__title${job._id===activeJob._id?" note__title--active":""}`}
                >
                  {activeJob._id===job._id?activeJob.title:job.title}
                </div>
              )}
              <div 
                onClick={clickNew}
                className={`note__title`}
              >+</div>
            </div>
            {formActive
              ?<div className="task-tracker__form">
                <input className="task-tracker__input" name="title" placeholder="Title" value={newJob.title} onChange={updateForm} />
                <div className="task-tracker__date">
                  <select className="calendar__form--field" name="month" value={newJob.month} onChange={updateForm} >
                    {printOptions(12,1,true)}
                  </select>
                  <select className="calendar__form--field" name="date" value={newJob.date} onChange={updateForm} >
                    {printOptions(31,1,true)}
                  </select>
                  <select className="calendar__form--field" name="year" value={newJob.year} onChange={updateForm} >
                    {printOptions(5,Number(new Date().getFullYear()),false)}
                  </select>
                </div>
                <input className="task-tracker__input" placeholder="Expected Amount" name="totalCount" value={newJob.totalCount} onChange={updateForm} />
                <input className="task-tracker__input" placeholder="Units" name="units" value={newJob.units} onChange={updateForm} />
                {Array.isArray(newJob.url) && newJob.url.map((resource: {title: string, url: string}, i: number) => 
                  <div className="task-tracker__resource" key={resource.url}>
                    <input className="task-tracker__input--left-pair" placeholder="Resource Title" name="urlTitle" data-index={i} value={resource.title} onChange={updateForm} />
                    <input className="task-tracker__input" placeholder="Resource URL" name="urlUrl" data-index={i} value={resource.url} onChange={updateForm} />
                  </div>
                )}
                <div className="task-tracker__actions--form">
                  <button className="task-tracker__button" onClick={addTask}>SUBMIT</button>
                </div>
              </div>
              :activeJob&&<>
              <div className="task-tracker__title">{activeJob.title}</div>
                <div className="task-tracker__goal">{Number(activeJob.totalCount).toLocaleString("en-US")} {activeJob.units}</div>
                <div className="task-tracker__deadline">
                  Due {activeJob.deadline} 
                  <p className="task-tracker__deadline-relative">
                    ({timeDiff(
                      new Date( Number(activeJob.year), Number(activeJob.month), Number(activeJob.date)).getTime(),
                      new Date( Number(initYr), Number(initMo), Number(initDt)).getTime())
                    } days from now)
                  </p>
                </div>
                <p className="task-tracker__resources">Resources</p>
                <ul className="task-tracker__resource-ul">
                  {activeJob.url.map((link: {title: string, url: string}) => 
                    <li className="task-tracker__resource-li" key={`${activeJob._id}_${link.url}`}>
                      <a className="task-tracker__resource-a" href={link.url} target="__BLANK">{link.title}</a>
                    </li>
                  )}
                </ul>
                <div className="task-tracker__current">Currently: 
                  <input 
                    className="task-tracker__current-input" 
                    onChange={updateCurrent}
                    placeholder="0"
                    value={activeJob.curCount==="0"?"":activeJob.curCount}
                  />
                </div>
                <div className="task-tracker__summary">
                  {`
                    ${(Number(activeJob.totalCount)-Number(activeJob.curCount)).toLocaleString("en-US")}
                    ${activeJob.units} remaining.
                  `}
                  {
                    Math.ceil((Number(activeJob.totalCount)-Number(activeJob.curCount))/timeDiff(
                      new Date( Number(activeJob.year), Number(activeJob.month), Number(activeJob.date)).getTime(),
                      new Date( Number(initYr), Number(initMo), Number(initDt)).getTime()
                    )).toLocaleString("en-US")
                  } {activeJob.units} a day to meet deadline.
                </div>
                <div className="task-tracker__actions">
                  <button className="task-tracker__button task-tracker__button--yellow" onClick={() => archiveTask(activeJob)}>ARCHIVE</button>
                  <button className="task-tracker__button task-tracker__button--red" onClick={() => deleteTask(activeJob)}>DELETE</button>
                  <button className="task-tracker__button" onClick={() => updateTask(activeJob)}>SAVE</button>
                </div>
              </>}
          </div>
        </div>
      </article>
    </>
  )
}