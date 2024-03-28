// required dom elements

const buttonEl = document.getElementById("button");
const buttonTopic = document.getElementById("addTopic");
const buttonQuestion=document.getElementById("addQuestion")
const messageEl = document.getElementById("message");
const titleEl = document.getElementById("real-time-title");

// set initial state of application variables
// messageEl.style.display = "none";
let isRecording = false;
let rt;
let rtSummary;
let microphone;
let wholetext = "";
const svg = d3.select("#container")
    .append("svg")
    .attr("width", 1500)
    .attr("height", 1500);
const group = svg.append("g");


function createMicrophone() {
  let stream;
  let audioContext;
  let audioWorkletNode;
  let source;
  let audioBufferQueue = new Int16Array(0);
  return {
    async requestPermission() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    },
    async startRecording(onAudioCallback) {
      if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext({
        sampleRate: 16_000,
        latencyHint: 'balanced'
      });
      source = audioContext.createMediaStreamSource(stream);

      await audioContext.audioWorklet.addModule('audio-processor.js');
      audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');

      source.connect(audioWorkletNode);
      audioWorkletNode.connect(audioContext.destination);
      audioWorkletNode.port.onmessage = (event) => {
        const currentBuffer = new Int16Array(event.data.audio_data);
        audioBufferQueue = mergeBuffers(
          audioBufferQueue,
          currentBuffer
        );

        const bufferDuration =
          (audioBufferQueue.length / audioContext.sampleRate) * 1000;

        // wait until we have 100ms of audio data
        if (bufferDuration >= 100) {
          const totalSamples = Math.floor(audioContext.sampleRate * 0.1);

          const finalBuffer = new Uint8Array(
            audioBufferQueue.subarray(0, totalSamples).buffer
          );

          audioBufferQueue = audioBufferQueue.subarray(totalSamples)
          if (onAudioCallback) onAudioCallback(finalBuffer);
        }
      }
    },
    stopRecording() {
      stream?.getTracks().forEach((track) => track.stop());
      audioContext?.close();
      audioBufferQueue = new Int16Array(0);
    }
  }
}
function mergeBuffers(lhs, rhs) {
  const mergedBuffer = new Int16Array(lhs.length + rhs.length)
  mergedBuffer.set(lhs, 0)
  mergedBuffer.set(rhs, lhs.length)
  return mergedBuffer
}

const callSummary = async (textToSummary) => {
  const summaryRes = await fetch('/get_summary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input_text: textToSummary
    })
  });

  if (summaryRes.status === 200)
  {
    const jsonResult = await summaryRes.json();
    console.log(jsonResult.response);
    var finalSummary =jsonResult.response.response;
    finalSummary = finalSummary.replace(/<\/?text>/g, '');
    messageEl.innerText=finalSummary;
  }
}



// runs real-time transcription and handles global variables
const run = async () => {
  if (isRecording) {
    if (rt) {
      await rt.close(false);
      rt = null;
    }

    if (microphone) {
      microphone.stopRecording();
      microphone = null;
    }
    callSummary(wholetext);
  }
  else
  {
    microphone = createMicrophone();
    await microphone.requestPermission();

    const response = await fetch("/token"); // get temp session token from server.js (backend)
    const data = await response.json();

    if (data.error) {
      alert(data.error);
      return;
    }
    rt = new assemblyai.RealtimeService({ token: data.token });
    rtSummary = new assemblyai.LemurService ({ token: data.token });

    // handle incoming messages to display transcription to the DOM
    const texts = {};
    let speak=true;
    let circle;
    let delta=0;
    let text;

    rt.on("transcript", (message) => {

      if(speak){
        circle= group.append("circle")
            .attr("cx", 100+delta) // 圆心的x坐标
            .attr("cy", 100) // 圆心的y坐标
            .attr("r", 50) // 圆的半径
            .style("fill", "yellow") // 填充颜色
            .style("cursor", "move"); // 允许拖动;
        text = group.append("text")
            .attr("x", 100+delta) // 文本的x坐标
            .attr("y", 100) // 文本的y坐标
            .attr("text-anchor", "middle") // 文本在圆心水平居中
            .attr("alignment-baseline", "middle") // 文本在圆心垂直居中
            .text("") // 文本内容
            .style("pointer-events", "none"); // 防止文本干扰拖动
      }
      speak=false;

      let msg = "";
      texts[message.audio_start] = message.text;
      const keys = Object.keys(texts);
      keys.sort((a, b) => a - b);
      for (const key of keys) {
        if (texts[key]) {
          msg += ` ${texts[key]}`;
        }
        let instantText;
        instantText=` ${texts[key]}`
        text.text(instantText);
      }
      wholetext=msg;
      messageEl.innerText=wholetext;


      const dragHandler = d3.drag()
          .on("drag", function(event) {
            const newX = event.x;
            const newY = event.y;
            circle.attr("cx", newX);
            circle.attr("cy", newY);
            text.attr("x", newX);
            text.attr("y", newY);
          });
      circle.call(dragHandler);
    });

    rt.on("error", async (error) => {
      console.error(error);
      await rt.close();
    });

    rt.on("close", (event) => {
      console.log(event);
      rt = null;
    });
    // const { summary } = await client.lemur.task({
    //   transcript_ids: msg,
    //   prompt
    // })
    // console.log(summary)
    await rt.connect();
    // once socket is open, begin recording
    messageEl.style.display = "";

    await microphone.startRecording((audioData) => {
      rt.sendAudio(audioData);
    });
  }

  isRecording = !isRecording;

  buttonEl.innerText = isRecording ? "Stop" : "Record";
  titleEl.innerText = isRecording
    ? "Click stop to end recording!"
    : "Click start to begin recording!";

};


buttonEl.addEventListener("click", () => run());
buttonQuestion.addEventListener("click",)

