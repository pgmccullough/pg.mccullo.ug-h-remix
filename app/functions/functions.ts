export const stampToTime = (unix_timestamp:number) => {
  const monthName = ["January", "February", "March", "April", "May", "June","July", "August", "September", "October", "November", "December"];
  let dateTest = new Date(unix_timestamp*1000);
  let month = monthName[dateTest.getMonth()];
  let date = dateTest.getDate();
  let year = dateTest.getFullYear();
  let hour = dateTest.getHours();
  let mins = dateTest.getMinutes().toString();
  if(mins.length === 1) mins = "0"+mins;
  let ampm;
  if(hour > 12) {
      ampm = "pm";
      hour = hour - 12;
  } else if(hour===0) {
      hour = 12;
      ampm = "am"
  } else {
      ampm = "am";
  }
  let timeDiff = (Date.now()-(unix_timestamp*1000))/1000;
  if(timeDiff/60 < 1) return "A few seconds ago";
  if(timeDiff/60 < 60) return Math.round(timeDiff/60)+" minutes ago";
  if(timeDiff/60/60 < 24) {
      
      return Math.round(timeDiff/60/60)===1?Math.round(timeDiff/60/60)+" hour ago":Math.round(timeDiff/60/60)+" hours ago";
  }
  return month+" "+date+", "+year+" at "+hour+":"+mins+ampm;
}