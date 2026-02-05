'use client';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
interface Point {
    date: string;
    value: number;
}
interface TimeSeriesChartProps {
    title: string;
    data: Point[];
    color?: string;
    onDateClick?: (date: string, type: 'issues' | 'requests' | 'receives' | 'rrps') => void;
    chartType?: 'issues' | 'requests' | 'receives' | 'rrps';
}
function createSmoothPath(points: Array<{
    x: number;
    y: number;
}>): string {
    if (points.length < 2)
        return '';
    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
}
export function TimeSeriesChart({ title, data, color = "#003594", onDateClick, chartType }: TimeSeriesChartProps) {
    const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const tooltipRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const isOverTooltipRef = useRef(false);
    const [containerSize, setContainerSize] = useState({ width: 600, height: 240 });
    const [transform, setTransform] = useState({ scale: 1, translateX: 0, translateY: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const zoomMin = 0.5;
    const zoomMax = 4;
    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setContainerSize({
                    width: Math.max(400, rect.width || 600),
                    height: 240
                });
            }
        };
        updateSize();
        const resizeObserver = new ResizeObserver(() => {
            updateSize();
        });
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }
        window.addEventListener('resize', updateSize);
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateSize);
        };
    }, [data.length]);
    const width = containerSize.width;
    const height = containerSize.height;
    const padding = useMemo(() => ({ top: 20, right: 20, bottom: 60, left: 50 }), []);
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;
    const { minV, maxV, minX, maxX, x, y, smoothPathD, linearPathD, chartPoints } = useMemo(() => {
        const vals = data.map(d => d.value);
        const minVal = Math.min(0, ...vals);
        const maxVal = Math.max(1, ...vals);
        const dateTimes = data.map(d => new Date(d.date).getTime());
        const minDate = dateTimes[0] ?? Date.now();
        const maxDate = dateTimes[dateTimes.length - 1] ?? Date.now();
        const xScale = (t: number) => padding.left + ((t - minDate) / Math.max(1, maxDate - minDate)) * innerW;
        const yScale = (v: number) => padding.top + innerH - ((v - minVal) / Math.max(1, maxVal - minVal)) * innerH;
        const points = data.map(d => ({
            x: xScale(new Date(d.date).getTime()),
            y: yScale(d.value),
            point: d
        }));
        const smoothPath = createSmoothPath(points);
        const linearPath = data.reduce((acc, d, i) => {
            const cmd = i === 0 ? 'M' : 'L';
            return `${acc} ${cmd} ${xScale(new Date(d.date).getTime())} ${yScale(d.value)}`;
        }, '');
        return {
            minV: minVal,
            maxV: maxVal,
            minX: minDate,
            maxX: maxDate,
            x: xScale,
            y: yScale,
            smoothPathD: smoothPath,
            linearPathD: linearPath,
            chartPoints: points
        };
    }, [data, padding.left, padding.top, innerW, innerH]);
    const { gridLines, yLabels, xLabels } = useMemo(() => {
        const numGridLines = 5;
        const grids = [];
        const yLabs = [];
        for (let i = 0; i <= numGridLines; i++) {
            const yPos = padding.top + (i / numGridLines) * innerH;
            grids.push(<line key={`grid-${i}`} x1={padding.left} y1={yPos} x2={width - padding.right} y2={yPos} stroke="#e5e7eb" strokeWidth={1} strokeDasharray={i === numGridLines ? "0" : "4,4"} opacity={0.6}/>);
            const value = minV + (i / numGridLines) * (maxV - minV);
            const yLabelPos = padding.top + ((numGridLines - i) / numGridLines) * innerH;
            yLabs.push(<text key={`ylabel-${i}`} x={padding.left - 12} y={yLabelPos + 4} textAnchor="end" fontSize="11" fill="#6b7280" fontWeight={i === 0 || i === numGridLines ? "600" : "400"}>
					{Math.round(value)}
				</text>);
        }
        const xLabs = [];
        if (data.length > 0) {
            const effectiveWidth = innerW * transform.scale;
            const minLabelWidth = 70;
            const maxLabels = Math.max(2, Math.floor(effectiveWidth / minLabelWidth));
            const numXLabels = Math.min(maxLabels, data.length);
            const step = data.length > 1 ? Math.max(1, Math.floor((data.length - 1) / (numXLabels - 1))) : 1;
            const usedPositions: number[] = [];
            const minSpacing = 60;
            for (let i = 0; i < data.length; i += step) {
                if (i >= data.length)
                    break;
                const point = data[i];
                const xPos = x(new Date(point.date).getTime());
                const tooClose = usedPositions.some(pos => Math.abs(xPos - pos) < minSpacing);
                if (tooClose && i !== 0 && i !== data.length - 1)
                    continue;
                usedPositions.push(xPos);
                xLabs.push(<g key={`xlabel-${i}`}>
						<text x={xPos} y={height - padding.bottom + 15} textAnchor="middle" fontSize="10" fill="#6b7280" fontWeight="500" transform={`rotate(-45 ${xPos} ${height - padding.bottom + 15})`}>
							{format(parseISO(point.date), 'MMM d')}
						</text>
					</g>);
            }
            if (data.length > 1) {
                const lastIndex = data.length - 1;
                const lastPoint = data[lastIndex];
                const lastXPos = x(new Date(lastPoint.date).getTime());
                const lastShown = usedPositions.some(pos => Math.abs(lastXPos - pos) < 5);
                if (!lastShown) {
                    xLabs.push(<g key={`xlabel-last`}>
							<text x={lastXPos} y={height - padding.bottom + 15} textAnchor="middle" fontSize="10" fill="#6b7280" fontWeight="500" transform={`rotate(-45 ${lastXPos} ${height - padding.bottom + 15})`}>
								{format(parseISO(lastPoint.date), 'MMM d')}
							</text>
						</g>);
                }
            }
        }
        return { gridLines: grids, yLabels: yLabs, xLabels: xLabs };
    }, [data, minV, maxV, padding, innerH, innerW, width, height, x, transform.scale]);
    const screenToChart = useCallback((screenX: number, screenY: number, rect: DOMRect) => {
        const svgX = ((screenX - rect.left) / rect.width) * width;
        const svgY = ((screenY - rect.top) / rect.height) * height;
        const chartX = (svgX - width / 2 - transform.translateX) / transform.scale + width / 2;
        const chartY = (svgY - height / 2 - transform.translateY) / transform.scale + height / 2;
        return { x: chartX, y: chartY };
    }, [width, height, transform]);
    const chartToScreen = useCallback((chartX: number, chartY: number) => {
        const screenX = (chartX - width / 2) * transform.scale + width / 2 + transform.translateX;
        const screenY = (chartY - height / 2) * transform.scale + height / 2 + transform.translateY;
        return { x: screenX, y: screenY };
    }, [width, height, transform]);
    const handleMouseMove = useCallback((event: React.MouseEvent<SVGElement>) => {
        if (isPanning)
            return;
        const rect = event.currentTarget.getBoundingClientRect();
        const { x: chartX } = screenToChart(event.clientX, event.clientY, rect);
        let closestPoint: Point | null = null;
        let minDistance = Infinity;
        const threshold = 40 / transform.scale;
        for (const { x: pointX, point } of chartPoints) {
            const distance = Math.abs(chartX - pointX);
            if (distance < minDistance && distance < threshold) {
                minDistance = distance;
                closestPoint = point;
            }
        }
        if (closestPoint) {
            setHoveredPoint(closestPoint);
            const pointXPos = x(new Date(closestPoint.date).getTime());
            const pointYPos = y(closestPoint.value);
            const screenPos = chartToScreen(pointXPos, pointYPos);
            const rect = event.currentTarget.getBoundingClientRect();
            const scaleX = rect.width / width;
            const scaleY = rect.height / height;
            setTooltipPosition({
                x: screenPos.x * scaleX,
                y: screenPos.y * scaleY - 20
            });
        }
        else {
            setHoveredPoint(null);
        }
    }, [height, isPanning, screenToChart, chartToScreen, chartPoints, x, y, width, transform.scale]);
    const handleMouseLeave = useCallback(() => {
        setTimeout(() => {
            if (!isOverTooltipRef.current) {
                setHoveredPoint(null);
            }
        }, 300);
    }, []);
    const handlePointClick = (point: Point) => {
        if (onDateClick && chartType) {
            onDateClick(point.date, chartType);
        }
    };
    const handleTooltipClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hoveredPoint && onDateClick && chartType) {
            onDateClick(hoveredPoint.date, chartType);
        }
    };
    const handleChartClick = () => {
        if (hoveredPoint && onDateClick && chartType && !isPanning) {
            onDateClick(hoveredPoint.date, chartType);
        }
    };
    const handleZoom = useCallback((delta: number, mouseX?: number, mouseY?: number) => {
        setTransform(prev => {
            const newScale = Math.max(zoomMin, Math.min(prev.scale * delta, zoomMax));
            if (mouseX !== undefined && mouseY !== undefined && svgRef.current) {
                const rect = svgRef.current.getBoundingClientRect();
                const svgMouseX = ((mouseX - rect.left) / rect.width) * width;
                const svgMouseY = ((mouseY - rect.top) / rect.height) * height;
                const scaleChange = newScale / prev.scale;
                const newTranslateX = svgMouseX - (svgMouseX - prev.translateX - width / 2) * scaleChange - width / 2;
                const newTranslateY = svgMouseY - (svgMouseY - prev.translateY - height / 2) * scaleChange - height / 2;
                return {
                    scale: newScale,
                    translateX: newTranslateX,
                    translateY: newTranslateY
                };
            }
            return {
                scale: newScale,
                translateX: prev.translateX,
                translateY: prev.translateY
            };
        });
    }, [zoomMin, zoomMax, width, height]);
    const handleZoomIn = useCallback(() => {
        handleZoom(1.3);
    }, [handleZoom]);
    const handleZoomOut = useCallback(() => {
        handleZoom(1 / 1.3);
    }, [handleZoom]);
    const handleResetZoom = useCallback(() => {
        setTransform({ scale: 1, translateX: 0, translateY: 0 });
    }, []);
    const handleMouseDown = useCallback((e: React.MouseEvent<SVGElement>) => {
        if (e.button === 0 && transform.scale > 1 && !hoveredPoint) {
            e.preventDefault();
            setIsPanning(true);
            const rect = e.currentTarget.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * width;
            const svgY = ((e.clientY - rect.top) / rect.height) * height;
            panStartRef.current = {
                x: svgX - transform.translateX,
                y: svgY - transform.translateY
            };
        }
    }, [transform, hoveredPoint, width, height]);
    const handleMouseMovePan = useCallback((e: React.MouseEvent<SVGElement>) => {
        if (isPanning) {
            const rect = e.currentTarget.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * width;
            const svgY = ((e.clientY - rect.top) / rect.height) * height;
            setTransform(prev => ({
                ...prev,
                translateX: svgX - panStartRef.current.x,
                translateY: svgY - panStartRef.current.y
            }));
        }
    }, [isPanning, width, height]);
    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);
    const handleWheel = useCallback((e: React.WheelEvent<SVGElement>) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        handleZoom(delta, e.clientX, e.clientY);
    }, [handleZoom]);
    useEffect(() => {
        setTransform({ scale: 1, translateX: 0, translateY: 0 });
    }, [data.length]);
    const chartId = useMemo(() => title.replace(/\s+/g, '-').toLowerCase(), [title]);
    const isEmpty = data.length === 0;
    return (<div className="group relative bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-5 hover:shadow-lg transition-all duration-300 overflow-hidden">
			
			<div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-5 blur-3xl transition-opacity group-hover:opacity-10" style={{ backgroundColor: color }}/>
			
			<div className="relative">
				<div className="flex items-center justify-between mb-4">
					<div className="text-sm font-semibold text-[#003594]">{title}</div>
					<div className="flex items-center gap-2">
						{data.length > 0 && (<div className="flex items-center gap-2 text-xs text-gray-500">
								<div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}/>
								<span className="font-medium">{data.length} data points</span>
							</div>)}
						{!isEmpty && (<div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1 bg-white/90 shadow-sm">
								<Button variant="ghost" size="sm" onClick={handleZoomOut} disabled={transform.scale <= zoomMin} className="h-7 w-7 p-0 hover:bg-gray-100" title="Zoom Out">
									<ZoomOut className="h-3.5 w-3.5"/>
								</Button>
								<Button variant="ghost" size="sm" onClick={handleZoomIn} disabled={transform.scale >= zoomMax} className="h-7 w-7 p-0 hover:bg-gray-100" title="Zoom In">
									<ZoomIn className="h-3.5 w-3.5"/>
								</Button>
								<Button variant="ghost" size="sm" onClick={handleResetZoom} disabled={transform.scale === 1 && transform.translateX === 0 && transform.translateY === 0} className="h-7 w-7 p-0 hover:bg-gray-100" title="Reset View">
									<RotateCcw className="h-3.5 w-3.5"/>
								</Button>
								{transform.scale > 1 && (<span className="text-[10px] text-gray-500 px-1.5 font-medium min-w-[3rem] text-center">
										{Math.round(transform.scale * 100)}%
									</span>)}
							</div>)}
					</div>
				</div>
				
				<div className="relative" ref={containerRef}>
					{isEmpty ? (<div className="flex h-60 items-center justify-center text-sm text-gray-400">
							No data available for this period
						</div>) : (<svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className={`w-full h-60 ${isPanning ? 'cursor-grabbing' : transform.scale > 1 ? 'cursor-grab' : 'cursor-pointer'} select-none`} style={{ minHeight: '240px' }} onMouseMove={(e) => {
                if (!isPanning) {
                    handleMouseMove(e);
                }
                else {
                    handleMouseMovePan(e);
                }
            }} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={() => {
                handleMouseLeave();
                if (isPanning) {
                    handleMouseUp();
                }
            }} onClick={handleChartClick} onWheel={handleWheel} preserveAspectRatio="none">
							<defs>
								
								<linearGradient id={`gradient-${chartId}`} x1="0%" y1="0%" x2="0%" y2="100%">
									<stop offset="0%" stopColor={color} stopOpacity={0.4}/>
									<stop offset="50%" stopColor={color} stopOpacity={0.15}/>
									<stop offset="100%" stopColor={color} stopOpacity={0.05}/>
								</linearGradient>
								
								
								<filter id={`shadow-${chartId}`} x="-50%" y="-50%" width="200%" height="200%">
									<feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
									<feOffset dx="0" dy="2" result="offsetblur"/>
									<feComponentTransfer>
										<feFuncA type="linear" slope="0.3"/>
									</feComponentTransfer>
									<feMerge>
										<feMergeNode />
										<feMergeNode in="SourceGraphic"/>
									</feMerge>
								</filter>
								
								
								<filter id={`glow-${chartId}`}>
									<feGaussianBlur stdDeviation="4" result="coloredBlur"/>
									<feMerge>
										<feMergeNode in="coloredBlur"/>
										<feMergeNode in="SourceGraphic"/>
									</feMerge>
								</filter>
							</defs>
							
							
							<rect x={0} y={0} width={width} height={height} fill="#fafbfc"/>
							
							
							<g transform={`translate(${width / 2 + transform.translateX}, ${height / 2 + transform.translateY}) scale(${transform.scale}) translate(${-width / 2}, ${-height / 2})`}>
								
								{gridLines}
								
								
								{yLabels}
								
								
								{xLabels}
								
								
								<line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#d1d5db" strokeWidth={2}/>
								<line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#d1d5db" strokeWidth={2}/>
								
								
								{data.length > 1 && (<path d={`${smoothPathD} L ${x(maxX)} ${height - padding.bottom} L ${x(minX)} ${height - padding.bottom} Z`} fill={`url(#gradient-${chartId})`} className="transition-opacity duration-300"/>)}
								
								
								<path d={data.length > 2 ? smoothPathD : linearPathD} stroke={color} strokeWidth={3} fill="none" filter={`url(#shadow-${chartId})`} strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-300"/>
								
								
								{hoveredPoint && (<line x1={x(new Date(hoveredPoint.date).getTime())} y1={padding.top} x2={x(new Date(hoveredPoint.date).getTime())} y2={height - padding.bottom} stroke={color} strokeWidth={1.5} strokeDasharray="4,4" opacity={0.4} className="transition-opacity duration-200"/>)}
								
								
								{chartPoints.map(({ x: pointX, y: pointY, point }, i) => {
                const isHovered = hoveredPoint === point;
                return (<g key={i}>
											
											{isHovered && (<circle cx={pointX} cy={pointY} r={10} fill={color} opacity={0.2} filter={`url(#glow-${chartId})`} className="transition-all duration-200"/>)}
											
											<circle cx={pointX} cy={pointY} r={isHovered ? 6 : 4} fill={color} stroke="#fff" strokeWidth={isHovered ? 3 : 2} className="transition-all duration-200" filter={isHovered ? `url(#glow-${chartId})` : undefined}/>
											
											<circle cx={pointX} cy={pointY} r={20} fill="transparent" className={`cursor-pointer ${onDateClick ? 'hover:fill-current hover:fill-opacity-5' : ''}`} onClick={(e) => {
                        e.stopPropagation();
                        handlePointClick(point);
                    }}/>
										</g>);
            })}
							</g>
						</svg>)}
					
					
					{hoveredPoint && !isEmpty && (<div ref={tooltipRef} className={`absolute bg-white border-2 rounded-xl shadow-2xl text-xs px-4 py-3 z-30 backdrop-blur-sm transition-all duration-200 ${onDateClick ? 'cursor-pointer pointer-events-auto hover:scale-105' : 'pointer-events-none'}`} style={{
                left: `${tooltipPosition.x}px`,
                top: `${tooltipPosition.y - 80}px`,
                transform: 'translateX(-50%)',
                borderColor: color,
                boxShadow: `0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 4px 6px -2px rgba(0, 0, 0, 0.1)`
            }} onClick={handleTooltipClick} onMouseEnter={() => {
                isOverTooltipRef.current = true;
            }} onMouseLeave={() => {
                isOverTooltipRef.current = false;
                setTimeout(() => {
                    if (!isOverTooltipRef.current) {
                        setHoveredPoint(null);
                    }
                }, 200);
            }}>
							<div className="flex items-center gap-2 mb-1">
								<div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}/>
								<div className="font-bold text-gray-900">
									{format(parseISO(hoveredPoint.date), 'MMM d, yyyy')}
								</div>
							</div>
							<div className="text-gray-700 font-semibold text-sm">
								Value: <span style={{ color }}>{hoveredPoint.value}</span>
							</div>
							{onDateClick && (<button type="button" className="w-full mt-2 pt-2 border-t border-gray-200 text-xs font-semibold transition-colors rounded-lg px-2 py-1.5 hover:bg-gray-50 active:scale-95" style={{ color }} onClick={(e) => {
                    e.stopPropagation();
                    handleTooltipClick(e);
                }}>
									View details →
								</button>)}
						</div>)}
				</div>
				
				
				{!isEmpty && (<div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4">
						<div className="text-center">
							<div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Total</div>
							<div className="text-base font-bold text-gray-900">{data.reduce((sum, d) => sum + d.value, 0)}</div>
						</div>
						<div className="text-center">
							<div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Average</div>
							<div className="text-base font-bold text-gray-900">{Math.round(data.reduce((sum, d) => sum + d.value, 0) / data.length)}</div>
						</div>
						<div className="text-center">
							<div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Peak</div>
							<div className="text-base font-bold" style={{ color }}>{Math.max(...data.map(d => d.value))}</div>
						</div>
					</div>)}
			</div>
		</div>);
}
