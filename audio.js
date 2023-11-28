const canvas = document.querySelector("canvas");
const button = document.querySelector("button");

button.addEventListener("click", audioInit);

if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu");
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
    device: device,
    format: canvasFormat,
});

let audioWave = new Float32Array(2048);

const audioWaveVertexBuffer = device.createBuffer({
    label: 'audio wave vertices',
    size: audioWave.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const module = device.createShaderModule({
    code: `
	  @vertex fn vs(@location(0) y: f32, @builtin(vertex_index) i : u32) -> @builtin(position) vec4f {
		let a : f32 = f32(i) * 1.0 / 2048.0;
		let x : f32 = (a * 2)-1;
        return vec4f(x, y, 0.0, 1.0);
      }

      @fragment fn fs() -> @location(0) vec4f {
        return vec4f(1.0, 0.0, 0.0, 1.0);
      }
    `,
  });


const pipeline = device.createRenderPipeline({
  label: "Audio Wave Test",
  layout: "auto",
  vertex: {
    module,
    entryPoint: "vs",
    buffers: [
      {
		arrayStride: 4, // 1 float, 4 bytes
        attributes: [
		  {shaderLocation: 0, offset: 0, format: 'float32'},  // y-offset
        ],
      },
    ],
  },
  fragment: {
    module,
    entryPoint: "fs",
    targets: [{format: canvasFormat}],
  },
  primitive: {
    topology: "line-strip",
  },
});

function audioInit() {
	button.removeEventListener("click", audioInit);
	
	const audioCtx = new AudioContext();

	const analyser = audioCtx.createAnalyser();
	analyser.minDecibels = -90;
	analyser.maxDecibels = -10;
	analyser.smoothingTimeConstant = 0.85;

	navigator
		.mediaDevices
		.getUserMedia({ audio: true })
		.then(function (stream) {
			let source = audioCtx.createMediaStreamSource(stream);
			source.connect(analyser);
			visualize();
		}).catch(function (err) {
			console.log(err);
			return;
		});

	function visualize() {
		analyser.fftSize = 2048;
		const bufferLength = analyser.fftSize;

		const draw = function () {
			requestAnimationFrame(draw);

			analyser.getFloatTimeDomainData(audioWave);
			
			device.queue.writeBuffer(audioWaveVertexBuffer, 0, audioWave);
			
			const encoder = device.createCommandEncoder();

			const pass = encoder.beginRenderPass({
				colorAttachments: [{
					view: context.getCurrentTexture().createView(),
					loadOp: "clear",
					clearValue: { r: 0, g: 0, b: 0.4, a: 1 },
					storeOp: "store",
				}]
			});
			pass.setPipeline(pipeline);
			pass.setVertexBuffer(0, audioWaveVertexBuffer);
			pass.draw(2048);
			
			pass.end();

			const commandBuffer = encoder.finish();
			device.queue.submit([commandBuffer]);
		};

		draw();
	}
}
