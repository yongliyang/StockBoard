"use client";

import React from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';

interface SparklineProps {
  data: { price: number; date?: string }[];
  color?: string;
  height?: number;
  showGradient?: boolean;
}

export function Sparkline({ 
  data, 
  color = "#3b82f6", 
  height = 64, 
  showGradient = true 
}: SparklineProps) {
  // 计算域，留出一点上下边距
  const prices = data.map(d => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = (max - min) * 0.1;

  if (data.length < 2) {
    return (
      <div style={{ height: `${height}px`, minWidth: 200 }} className="w-full flex items-center justify-center">
        <span className="text-[10px] text-zinc-300 font-medium">--</span>
      </div>
    );
  }

  return (
    <div style={{ height: `${height}px`, minWidth: 200 }} className="w-full">
      <ResponsiveContainer width="100%" height={height} minWidth={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <YAxis hide domain={[min - padding, max + padding]} />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-zinc-900 border border-zinc-800 px-2 py-1 rounded shadow-2xl text-[10px] font-mono text-zinc-100">
                    <p className="text-zinc-500 text-[8px] uppercase tracking-tighter">{payload[0].payload.date}</p>
                    <p className="font-bold text-blue-400">{payload[0].value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fillOpacity={1}
            fill={showGradient ? `url(#gradient-${color})` : "transparent"}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
