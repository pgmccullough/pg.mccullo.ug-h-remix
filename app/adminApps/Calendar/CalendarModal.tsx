import { useEffect, useState } from 'react';
import type { DayEvent, dateForm, niceDay } from '../../common/types';

export const CalendarModal: React.FC<{ 
  modalDisplay: {i: number, fulldate: string, day_events: DayEvent[]},
  setModalDisplay: any
}> = ({ modalDisplay, setModalDisplay }) => {
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const niceDay: niceDay = {
      year: modalDisplay.fulldate.substring(0,4),
      month: modalDisplay.fulldate.substring(4,6), 
      niceMonth: months[Number(modalDisplay.fulldate.substring(4,6))-1], 
      date: modalDisplay.fulldate.substring(6,8), 
      full: new Date(modalDisplay.fulldate.substring(4,6)+"-"+modalDisplay.fulldate.substring(6,8)+"-"+modalDisplay.fulldate.substring(0,4))
    };
    

    // const [addForm, toggleAddForm] = useState(false);
    // const [appointments, getAppointments] = useState([]);
    // const [dateForm, upDateForm] = useState<dateForm>({
    //     start_code: fullDay,
    //     event_title: "",
    //     event_details: "",
    //     start_hour: 12,
    //     start_minute: "00",
    //     start_ampm: "PM", 
    //     end_month: niceDay.niceMonth, 
    //     end_date: niceDay.date, 
    //     end_year: niceDay.year,
    //     end_hour: 12, 
    //     end_minute: 30, 
    //     end_ampm: "PM"
    // });
    
    // const updateForm = (e) => {
    //     upDateForm({...dateForm,[e.target.name]: e.target.value});
    // }

    // const getTodayDates = () => {
    //     const token = localStorage.getItem('token') || 0;
    //     axios(
    //         `${SERVER_URI}calendar/${fullDay}`, {
    //             headers: {
    //                 Authorization: 'Bearer ' + token
    //             }
    //         }).then((result) => {
    //             getAppointments(result.data);
    //         })
    // }

    // const postNewEvent = () => {
    //     const token = localStorage.getItem('token') || 0;
    //     axios.post(
    //         `${SERVER_URI}calendar/add`, {
    //             headers: {
    //                 Authorization: 'Bearer ' + token
    //             },
    //             dateForm
    //         }).then((_result) => {
    //             getTodayDates();
    //             upDateForm({
    //                 start_code: fullDay,
    //                 event_title: "",
    //                 event_details: "",
    //                 start_hour: 12,
    //                 start_minute: "00",
    //                 start_ampm: "PM", 
    //                 end_month: niceDay.niceMonth, 
    //                 end_date: niceDay.date, 
    //                 end_year: niceDay.year,
    //                 end_hour: 12, 
    //                 end_minute: 30, 
    //                 end_ampm: "PM"
    //             });
    //             toggleAddForm(!addForm);
    //         })
    // }

    // const addFormShowHide = () => {
    //     toggleAddForm(!addForm);
    // }

    // useEffect(() => {
    //     getTodayDates();
    // },[]);
    

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
                {modalDisplay.day_events.length>0
                  ?modalDisplay.day_events
                    .sort((a: DayEvent,b: DayEvent) => 
                      Number(a.start_time_string) - Number(b.start_time_string)
                    ).map((event: DayEvent) => (
                      <div className="calendar__appointments__ind" key={event._id}>
                        <div className="calendar__appointments__ind--time">
                          <>{event.start_time_formatted} - {event.end_time_formatted}</>
                        </div>
                        <div className="calendar__appointments__ind--event">
                          <div className="calendar__appointments__ind--event--title">{event.event_title}</div>
                          <div className="calendar__appointments__ind--event--details">{event.event_details||""}</div>
                        </div>
                      </div>
                )):"No events for this date."}
            </div>
            <div className="calendar__form">
                {/* {addForm?<> */}
                <input className="calendar__form--field--full-width" name="event_title" value={0} type="text" placeholder="Event Title" />
                <textarea className="calendar__form--field--full-width" name="event_details" value={0} placeholder="Event Details"></textarea>
                <div className="calendar__form--field--start-end-group">
                    <div className="calendar__form--field--start-end-group--label">Start Time</div>
                    <select className="calendar__form--field" name="start_hour" value={0}>
                        <option>1</option>
                        <option>2</option>
                        <option>3</option>
                        <option>4</option>
                        <option>5</option>
                        <option>6</option>
                        <option>7</option>
                        <option>8</option>
                        <option>9</option>
                        <option>10</option>
                        <option>11</option>
                        <option>12</option>
                    </select>
                    :
                    <select className="calendar__form--field" name="start_minute" value={0}>
                        <option>00</option>
                        <option>01</option>
                        <option>02</option>
                        <option>03</option>
                        <option>04</option>
                        <option>05</option>
                        <option>06</option>
                        <option>07</option>
                        <option>08</option>
                        <option>09</option>
                        <option>10</option>
                        <option>11</option>
                        <option>12</option>
                        <option>13</option>
                        <option>14</option>
                        <option>15</option>
                        <option>16</option>
                        <option>17</option>
                        <option>18</option>
                        <option>19</option>
                        <option>20</option>
                        <option>21</option>
                        <option>22</option>
                        <option>23</option>
                        <option>24</option>
                        <option>25</option>
                        <option>26</option>
                        <option>27</option>
                        <option>28</option>
                        <option>29</option>
                        <option>30</option>
                        <option>31</option>
                        <option>32</option>
                        <option>33</option>
                        <option>34</option>
                        <option>35</option>
                        <option>36</option>
                        <option>37</option>
                        <option>38</option>
                        <option>39</option>
                        <option>40</option>
                        <option>41</option>
                        <option>42</option>
                        <option>43</option>
                        <option>44</option>
                        <option>45</option>
                        <option>46</option>
                        <option>47</option>
                        <option>48</option>
                        <option>49</option>
                        <option>50</option>
                        <option>51</option>
                        <option>52</option>
                        <option>53</option>
                        <option>54</option>
                        <option>55</option>
                        <option>56</option>
                        <option>57</option>
                        <option>58</option>
                        <option>59</option>
                    </select>     
                    <select className="calendar__form--field" name="start_ampm" value={0}>
                        <option>AM</option>
                        <option>PM</option>
                    </select>
                </div>
                <div className="calendar__form--field--start-end-group">
                    <div className="calendar__form--field--start-end-group--label">End Date / Time</div>
                    <select className="calendar__form--field" name="end_month" value={0}>
                        <option>January</option>
                        <option>February</option>
                        <option>March</option>
                        <option>April</option>
                        <option>May</option>
                        <option>June</option>
                        <option>July</option>
                        <option>August</option>
                        <option>September</option>
                        <option>October</option>
                        <option>November</option>
                        <option>December</option>
                    </select>
                    <select className="calendar__form--field" name="end_date" value={0}>
                        <option>1</option>
                        <option>2</option>
                        <option>3</option>
                        <option>4</option>
                        <option>5</option>
                        <option>6</option>
                        <option>7</option>
                        <option>8</option>
                        <option>9</option>
                        <option>10</option>
                        <option>11</option>
                        <option>12</option>
                        <option>13</option>
                        <option>14</option>
                        <option>15</option>
                        <option>16</option>
                        <option>17</option>
                        <option>18</option>
                        <option>19</option>
                        <option>20</option>
                        <option>21</option>
                        <option>22</option>
                        <option>23</option>
                        <option>24</option>
                        <option>25</option>
                        <option>26</option>
                        <option>27</option>
                        <option>28</option>
                        <option>29</option>
                        <option>30</option>
                        <option>31</option>
                    </select>
                    <select className="calendar__form--field" name="end_year" value={0} >
                        <option>{2023}</option>
                        <option>{2024}</option>
                        <option>{2025}</option>
                        <option>{2026}</option>
                        <option>{2027}</option>
                        <option>{2028}</option>
                    </select>
                    <select className="calendar__form--field" name="end_hour" value={0} >
                        <option>1</option>
                        <option>2</option>
                        <option>3</option>
                        <option>4</option>
                        <option>5</option>
                        <option>6</option>
                        <option>7</option>
                        <option>8</option>
                        <option>9</option>
                        <option>10</option>
                        <option>11</option>
                        <option>12</option>
                    </select>
                    :
                    <select className="calendar__form--field" name="end_minute" value={0}>
                        <option>00</option>
                        <option>01</option>
                        <option>02</option>
                        <option>03</option>
                        <option>04</option>
                        <option>05</option>
                        <option>06</option>
                        <option>07</option>
                        <option>08</option>
                        <option>09</option>
                        <option>10</option>
                        <option>11</option>
                        <option>12</option>
                        <option>13</option>
                        <option>14</option>
                        <option>15</option>
                        <option>16</option>
                        <option>17</option>
                        <option>18</option>
                        <option>19</option>
                        <option>20</option>
                        <option>21</option>
                        <option>22</option>
                        <option>23</option>
                        <option>24</option>
                        <option>25</option>
                        <option>26</option>
                        <option>27</option>
                        <option>28</option>
                        <option>29</option>
                        <option>30</option>
                        <option>31</option>
                        <option>32</option>
                        <option>33</option>
                        <option>34</option>
                        <option>35</option>
                        <option>36</option>
                        <option>37</option>
                        <option>38</option>
                        <option>39</option>
                        <option>40</option>
                        <option>41</option>
                        <option>42</option>
                        <option>43</option>
                        <option>44</option>
                        <option>45</option>
                        <option>46</option>
                        <option>47</option>
                        <option>48</option>
                        <option>49</option>
                        <option>50</option>
                        <option>51</option>
                        <option>52</option>
                        <option>53</option>
                        <option>54</option>
                        <option>55</option>
                        <option>56</option>
                        <option>57</option>
                        <option>58</option>
                        <option>59</option>
                    </select>     
                    <select className="calendar__form--field" name="end_ampm" value={0} >
                        <option>AM</option>
                        <option>PM</option>
                    </select>
                </div>
                <div className="calendar__form--submit">SUBMIT</div>
                <div className="calendar__form--addEvent">+</div>
            </div>
        </div>
    )
}