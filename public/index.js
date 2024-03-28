// required dom elements

const startInterviewButton = document.getElementById("startInterviewButton");
const addTopicButton = document.getElementById("addTopicButton");
const addQuestionButton = document.getElementById("addQuestionButton")

const messageBox = document.getElementById("message-box");


// set initial state of application variables
// messageEl.style.display = "none";
let isRecording = false;
let rt;
let microphone;

// This is the most important status to maintain.
const mySegments = []; // seg {id, shapes: {circleElement, textElement}, fullMessage}
let segCount = 0;

const d3Group = d3.select("#my-canvas")
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .append("g");


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

const delta = 10;
const initializeBubbleForSegment = () => {

  const circleElement = d3Group.append("circle")
      .attr("cx", 100+delta) // 圆心的x坐标
      .attr("cy", 100) // 圆心的y坐标
      .attr("r", 50) // 圆的半径
      .style("fill", "yellow") // 填充颜色
      .style("cursor", "move"); // 允许拖动;
  const textElement = d3Group.append("text")
      .attr("x", 100+delta) // 文本的x坐标
      .attr("y", 100) // 文本的y坐标
      .attr("text-anchor", "middle") // 文本在圆心水平居中
      .attr("alignment-baseline", "middle") // 文本在圆心垂直居中
      .text("") // 文本内容
      .style("pointer-events", "none"); // 防止文本干扰拖动

  circleElement.call(d3.drag()
      .on("drag", (event) => {
        const newX = event.x;
        const newY = event.y;
        circleElement.attr("cx", newX);
        circleElement.attr("cy", newY);
        textElement.attr("x", newX);
        textElement.attr("y", newY);
      }));

  return {circleElement, textElement}
}

// runs real-time transcription and handles global variables
const run = async () => {
  if (isRecording) {
    // Stop recording:

    if (rt) {
      await rt.close(false);
      rt = null;
    }

    if (microphone) {
      microphone.stopRecording();
      microphone = null;
    }

    console.log("To summary", mySegments[segCount-1].fullMessage);
    const sumResult = await callSummary(mySegments[segCount-1].fullMessage);
    messageBox.innerText = sumResult;
    // messageBox.innerText = "summary";
  }
  else
  {
    // Start recording:
    console.log("Waiting for connection with AssemblyAI ...");

    microphone = createMicrophone();
    await microphone.requestPermission();

    const response = await fetch("/token"); // get temp session token from server.js (backend)
    const data = await response.json();

    if (data.error) {
      alert(data.error);
      return;
    }
    rt = new assemblyai.RealtimeService({ token: data.token });

    // handle incoming messages to display transcription to the DOM
    const texts = {};

    let isTheFirstTimeToSpeak = true;

    rt.on("transcript", (message) => {
      if (isTheFirstTimeToSpeak) {
        const shapes = initializeBubbleForSegment();
        const newSeg = {
          id: `seg_${segCount}`,
          shapes: shapes
        };
        mySegments.push(newSeg);
        segCount++;
        isTheFirstTimeToSpeak = false;
      }

      let msg = "";
      const currentSeg = mySegments[segCount-1];
      texts[message.audio_start] = message.text;
      const keys = Object.keys(texts);
      keys.sort((a, b) => a - b);
      for (const key of keys) {
        if (texts[key]) {
          msg += ` ${texts[key]}`;
        }

        const instantText = ` ${texts[key]}`;
        currentSeg.shapes.textElement.text(instantText);
      }

      currentSeg.fullMessage = msg;
      messageBox.innerText = msg;
    });

    rt.on("error", async (error) => {
      console.error(error);
      await rt.close();
    });

    rt.on("close", (event) => {
      console.log(event);
      rt = null;
    });

    await rt.connect();
    console.log("Connected. Start recording ...");

    await microphone.startRecording((audioData) => {
      rt.sendAudio(audioData);
    });
  }

  isRecording = !isRecording;

  startInterviewButton.innerText = isRecording ? "Stop" : "Start interview";
};

startInterviewButton.addEventListener("click", () => run());

