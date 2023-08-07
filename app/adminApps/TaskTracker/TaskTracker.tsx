import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { Job } from "~/common/types";

export const TaskTracker: React.FC<{}> = () => {

  const { jobs } = useLoaderData();

  const [ jobList, setJobList ] = useState<Job[]>(jobs);
  const [ activeJob, setactiveJob ] = useState<string>(jobs[0]._id);
  const [ newJob, setNewJob ] = useState<Job>({
    _id: '',
    title: '',
    deadline: '',
    month: '',
    date: '',
    year: '',
    totalCount: '',
    units: '',
    url: '',
    curCount: '',
    dailies: {},
    notes: []
  })

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

          </div>
        </div>
      </article>
    </>
  )
}