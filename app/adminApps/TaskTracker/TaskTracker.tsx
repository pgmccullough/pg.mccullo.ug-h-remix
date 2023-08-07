import { ChangeEvent, useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { Job } from "~/common/types";

export const TaskTracker: React.FC<{}> = () => {

  const { jobs } = useLoaderData();

  const initDt = (new Date().getMonth()+1).toString().padStart(2,"0");
  const initMo = (new Date().getDate()).toString().padStart(2,"0");
  const initYr = new Date().getFullYear();

  const [ jobList, setJobList ] = useState<Job[]>(jobs);
  const [ activeJob, setactiveJob ] = useState<string>(jobs[0]._id);
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
    notes: []
  })

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
      setNewJob({...newJob, [e.target.name]: e.target.value})
    }
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
                <input className="task-tracker__input" placeholder="Resource Title" name="urlTitle" data-index={i} value={resource.title} onChange={updateForm} />
                <input className="task-tracker__input" placeholder="Resource URL" name="urlUrl" data-index={i} value={resource.url} onChange={updateForm} />
              </div>
            )}
          </div>
        </div>
      </article>
    </>
  )
}