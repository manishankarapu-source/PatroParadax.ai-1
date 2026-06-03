import React, { useRef, useEffect } from 'react';

export const Visualizer = ({ analyser }: { analyser: AnalyserNode | null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        
        // Ensure a minimum height for the bars so it looks like a line when silent
        if (barHeight < 2) barHeight = 2;

        const gradient = ctx.createLinearGradient(0, height / 2 - barHeight / 2, 0, height / 2 + barHeight / 2);
        gradient.addColorStop(0, '#a1a1aa'); // zinc-400
        gradient.addColorStop(0.5, '#ffffff'); // white
        gradient.addColorStop(1, '#a1a1aa'); // zinc-400

        ctx.fillStyle = gradient;
        
        ctx.beginPath();
        // center the bar vertically
        ctx.roundRect(x, height / 2 - barHeight / 2, barWidth - 3, barHeight, 4);
        ctx.fill();

        x += barWidth;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={100}
      className="w-full h-full max-h-[100px]"
    />
  );
};
