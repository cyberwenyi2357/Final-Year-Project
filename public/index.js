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
var width = window.innerWidth;
var height = window.innerHeight;
let isTheFirstTimeToSpeak = true;
var stage = new Konva.Stage({
  container: 'my-canvas',
  width: width,
  height: height,
});

var layer = new Konva.Layer();
stage.add(layer);
let spaceBetweenQuestions=45;
// Create a new directed graph

var g=new graphlib.Graph();
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
const initializeBubbleForSegment = (x,y) => {
  var originalAttrs = {
    x: x,
    y: y,
    scaleX: 1,
    scaleY: 1,
    draggable: true,
    rotation: 0,
  };
  var group = new Konva.Group(originalAttrs);
  layer.add(group);
  let size=100;
  let circle=new Konva.Circle({
    x: 0,
    y: 0,
    radius: size/2,
    fill: 'red',
  });
  group.add(circle);
  var defaultText = ' ';
  var text = new Konva.Text({
    text: defaultText,
    x: size/1.8,
    y: size/1.2,
    width: size,
    // y:size/1.2,
    // align: 'right',
  });
  group.add(text);
  var hammertime = new Hammer(group, { domEvents: true });

  // add rotate gesture
  hammertime.get('rotate').set({ enable: true });

  // now attach all possible events
  group.on('swipe', function (ev) {
    text.text('swiping');
    group.to({
      x: group.x() + ev.evt.gesture.deltaX,
      y: group.y() + ev.evt.gesture.deltaY,

      onFinish: function () {
        group.to(Object.assign({}, originalAttrs));
        text.text(defaultText);
      },
    });
  });

  group.on('press', function (ev) {
    text.text('Under press');
    circle.to({
      fill: 'green',
    });
  });

  group.on('touchend', function (ev) {
    circle.to({
      fill: 'yellow',
    });

    setTimeout(() => {
      text.text(defaultText);
    }, 300);
  });

  group.on('dragend', () => {
    group.to(Object.assign({}, originalAttrs));
  });

  var oldRotation = 0;
  var startScale = 0;
  group.on('rotatestart', function (ev) {
    oldRotation = ev.evt.gesture.rotation;
    startScale = circle.scaleX();
    group.stopDrag();
    group.draggable(false);
    text.text('rotating...');
  });

  group.on('rotate', function (ev) {
    var delta = oldRotation - ev.evt.gesture.rotation;
    group.rotate(-delta);
    oldRotation = ev.evt.gesture.rotation;
    group.scaleX(startScale * ev.evt.gesture.scale);
    group.scaleY(startScale * ev.evt.gesture.scale);
  });

  group.on('rotateend rotatecancel', function (ev) {
    group.to(Object.assign({}, originalAttrs));
    text.text(defaultText);
    group.draggable(true);
  });
  return{group}
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
    // console.log("To summary", mySegments[segCount-1].fullMessage);
    // const sumResult = await callSummary(mySegments[segCount-1].fullMessage);
    // messageBox.innerText = sumResult;
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
    rt.on("transcript", (message) => {
      let msg = "";
      texts[message.audio_start] = message.text;
      const keys = Object.keys(texts);
      keys.sort((a, b) => a - b);
      for (const key of keys) {
        if (texts[key]) {
          msg += ` ${texts[key]}`;
        }
        let instantText;
        instantText=` ${texts[key]}`;
      }
messageBox.innerText=msg;
        // const newSeg = {
        //   id: `seg_${segCount}`,
        //   shapes: shapes
        // };
        // mySegments.push(newSeg);
        // segCount++;

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

startInterviewButton.addEventListener("click", () => {
  // 1
  // updatePositionAll();
for (let label of labelCollection){
  checkBoxCollection.push(addCheckBox(label));
  refreshAllQUestions(label);
}
  // 2
  run();
});
addQuestionButton.addEventListener("click",addQuestion);
let labelCollection=[];
let checkBoxCollection=[];
// initializeBubbleForSegment();

function addQuestion(){
  let newAttribute;
  let QA= new Konva.Group(newAttribute);
  var label = new Konva.Label({
    x: 50,
    y: 40+labelCollection.length * spaceBetweenQuestions,
    opacity: 1,
    draggable: true,
  });
  label.add(
      new Konva.Tag({
        fill: 'white',
      })
  );
  var textNode=new Konva.Text({
    text: 'Some text here',
    x: 50,
    y: 80,
    fontSize: 20,
    width: 400,
    padding:10,
  });
  label.add(
      textNode
  );
  layer.add(label);
  // const tex = label.getText()
  textNode.on('transform', function () {
    // reset scale, so only with is changing by transformer
    textNode.setAttrs({
      width: textNode.width() * textNode.scaleX(),
      scaleX: 2,
    });
  });

  textNode.on('dblclick dbltap', () => {
    // hide text node and transformer:
    textNode.hide();
    // create textarea over canvas with absolute position
    // first we need to find position for textarea
    // how to find it?

    // at first lets find position of text node relative to the stage:
    var textPosition = textNode.absolutePosition();

    // so position of textarea will be the sum of positions above:
    var areaPosition = {
      x: stage.container().offsetLeft + textPosition.x,
      y: stage.container().offsetTop + textPosition.y,
    };

    // create textarea and style it
    var textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    // apply many styles to match text on canvas as close as possible
    // remember that text rendering on canvas and on the textarea can be different
    // and sometimes it is hard to make it 100% the same. But we will try...
    textarea.value = textNode.text();
    textarea.style.position = 'absolute';
    textarea.style.top = areaPosition.y + 'px';
    textarea.style.left = areaPosition.x + 'px';

    textarea.style.width = textNode.width() - textNode.padding() * 2 + 'px';
    textarea.style.height =
        textNode.height() - textNode.padding() * 2 + 5 + 'px';
    textarea.style.fontSize = textNode.fontSize() + 'px';
    textarea.style.border = 'none';
    textarea.style.padding = '10px';
    textarea.style.margin = '0px';
    textarea.style.margin = '0px';
    textarea.style.overflow = 'hidden';
    textarea.style.background = 'white';
    textarea.style.outline = 'none';
    textarea.style.resize = 'none';
    textarea.style.lineHeight = textNode.lineHeight();
    textarea.style.fontFamily = textNode.fontFamily();
    textarea.style.transformOrigin = 'left top';
    textarea.style.textAlign = textNode.align();
    textarea.style.color = textNode.fill();
    var transform = '';

    var px = 0;
    // also we need to slightly move textarea on firefox
    // because it jumps a bit
    var isFirefox =
        navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    if (isFirefox) {
      px += 2 + Math.round(textNode.fontSize() / 20);
    }
    transform += 'translateY(-' + px + 'px)';

    textarea.style.transform = transform;

    // reset height
    textarea.style.height = 'auto';
    // after browsers resized it we can set actual value
    textarea.style.height = textarea.scrollHeight + 3 + 'px';

    textarea.focus();

// 创建 <input> 元素

    function removeTextarea() {
      textarea.parentNode.removeChild(textarea);
      window.removeEventListener('click', handleOutsideClick);
      textNode.show();

    }

    function setTextareaWidth(newWidth) {
      if (!newWidth) {
        // set width for placeholder
        newWidth = textNode.placeholder.length * textNode.fontSize();
      }
      // some extra fixes on different browsers
      var isSafari = /^((?!chrome|android).)*safari/i.test(
          navigator.userAgent
      );
      var isFirefox =
          navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
      if (isSafari || isFirefox) {
        newWidth = Math.ceil(newWidth);
      }

      var isEdge =
          document.documentMode || /Edge/.test(navigator.userAgent);
      if (isEdge) {
        newWidth += 1;
      }
      textarea.style.width = newWidth + 'px';
    }

    textarea.addEventListener('keydown', function (e) {
      // hide on enter
      // but don't hide on shift + enter
      if (e.keyCode === 13 && !e.shiftKey) {
        textNode.text(textarea.value);
        removeTextarea();
      }
      // on esc do not set value back to node
      if (e.keyCode === 27) {
        removeTextarea();
      }
    });

    textarea.addEventListener('keydown', function (e) {
      let scale = textNode.getAbsoluteScale().x;
      setTextareaWidth(textNode.width() * scale);
      textarea.style.height = 'auto';
      textarea.style.height =
          textarea.scrollHeight + textNode.fontSize() + 'px';
    });

    function handleOutsideClick(e) {
      if (e.target !== textarea) {
        textNode.text(textarea.value);
        removeTextarea();
      }
    }
    setTimeout(() => {
      window.addEventListener('click', handleOutsideClick);
    });
  });
  labelCollection.push(label);
}

function addCheckBox(label){
  let checkboxElement = document.createElement("input");
// 设置元素类型为复选框
  checkboxElement.type = "checkbox";
// 设置元素的 CSS 样式
  checkboxElement.style.position = "absolute";
  checkboxElement.style.top = label.y()+label.getText().height()*1.4+'px';
  checkboxElement.style.left = label.x()+label.getText().width()*0.8+'px';
  // console.log(checkboxElement.style.top);
  checkboxElement.style.width = "18px";
  checkboxElement.style.height = "18px";
  checkboxElement.style.zIndex = "9999";
// 将元素添加到文档中的适当位置
  document.body.appendChild(checkboxElement);
  function updateCheckboxPosition() {
    checkboxElement.style.top =  label.y()+label.getText().height()*3+ "px";
    checkboxElement.style.left = label.x()+label.getText().width()*0.9+'px';
    // 调用下一次更新
    requestAnimationFrame(updateCheckboxPosition);
  }
// 调用更新函数开始实时更新位置
  updateCheckboxPosition();
  checkboxElement.addEventListener("click", function(event) {
    // 在复选框被点击时执行的逻辑
    if (checkboxElement.checked) {
label.opacity(1);
      // if(isRecording)
      initializeBubbleForSegment(label.x(), label.y()+30);
      // run();
    } else {
      console.log("复选框未被选中");
    }
  });
  return checkboxElement;
}
function refreshAllQUestions(label){
  label.opacity(0.5);
}