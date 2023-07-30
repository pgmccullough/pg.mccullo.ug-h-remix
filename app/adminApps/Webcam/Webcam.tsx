import { useEffect, useRef, useState } from "react";

export const Webcam: React.FC<{}> = () => {

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [recordingStatus, setRecordingStatus] = useState<"inactive"|"recording">("inactive");
  const [stream, setStream] = useState<MediaStream|null>(null);
  const [videoChunks, setVideoChunks] = useState<BlobEvent[] | any>([]);
  const [recordedVideo, setRecordedVideo] = useState<string | null>(null);

  useEffect(() => {
    getVideo();
  }, [videoRef]);

  const startRecording = async () => {
    if(stream) {
      setRecordingStatus("recording");
      setRecordedVideo(null);
      const media = new MediaRecorder(stream, { mimeType: "video/webm" });
      mediaRecorder.current = media;
      mediaRecorder.current.start();
      let localVideoChunks: any[] = [];
      mediaRecorder.current.ondataavailable = (event) => {
        if (typeof event.data === "undefined") return;
        if (event.data.size === 0) return;
        localVideoChunks.push(event.data);
      };
      setVideoChunks(localVideoChunks);
    }
  };

  const stopRecording = () => {
    if(mediaRecorder.current) {
      setRecordingStatus("inactive");
      mediaRecorder.current.stop();
      mediaRecorder.current.onstop = () => {
        const videoBlob = new Blob(videoChunks);
        const videoUrl = URL.createObjectURL(videoBlob);
        setRecordedVideo(videoUrl);
        setVideoChunks([]);
      };
    }
  }

  const getVideo = async () => {
    const streamData = await navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
    if(videoRef.current) {
      setStream(streamData);
      let video = videoRef.current;
      video.srcObject = streamData;
      video.play();
    }
  };

  return (
    <>
      <article className="postcard--left">
        <div className="postcard__time">
          <div className="postcard__time__link--unlink">
            Camera
          </div>
        </div>
        <div className="postcard__content">
          <div className="postcard__content__media"/>
          <div className="webcam">
            <video className={`webcam__video${recordedVideo?" webcam__video--hide":""}`} ref={videoRef}/>
            {recordedVideo
              ?<>
                <video className="webcam__video" src={recordedVideo} controls />
                <a download href={recordedVideo}>
                  Download Video
                </a>
              </>
              :""
            }
            {recordingStatus==="inactive"
              ?<button onClick={startRecording}>RECORD</button>
              :<button onClick={stopRecording}>STOP</button>
            }
            {recordingStatus==="inactive"&&recordedVideo
              ?<button onClick={() => {setRecordedVideo(null)}}>Cancel</button>
              :""
            }
          </div>
        </div>
      </article>
    </>
  )
}