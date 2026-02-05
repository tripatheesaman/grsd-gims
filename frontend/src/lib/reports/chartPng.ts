import type { ChartConfiguration } from 'chart.js';
export type BarChartPngInput = {
    title: string;
    labels: string[];
    values: number[];
    width: number;
    height: number;
    yAxisLabel?: string;
};
export async function renderBarChartPng(input: BarChartPngInput): Promise<Buffer> {
    const { title, labels, values, width, height, yAxisLabel } = input;
    const { ChartJSNodeCanvas } = await import('chartjs-node-canvas');
    const chartCanvas = new ChartJSNodeCanvas({
        width,
        height,
        backgroundColour: 'white',
        chartCallback: (ChartJS) => {
            ChartJS.defaults.font.family = '"Times New Roman", Times, serif';
        },
    });
    const maxValue = Math.max(...values);
    const suggestedMax = maxValue === 0 ? 100 : Math.max(Math.ceil(maxValue * 1.15), maxValue * 1.1);
    const config: ChartConfiguration<'bar', number[], string> = {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: title,
                    data: values,
                    backgroundColor: values.map(() => '#000000'),
                    borderColor: values.map(() => '#000000'),
                    borderWidth: 1,
                    borderRadius: 4,
                    barThickness: 40,
                },
            ],
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: false,
            layout: {
                padding: {
                    left: 10,
                    right: 10,
                    top: 5,
                    bottom: 10,
                },
            },
            plugins: {
                legend: {
                    display: false,
                },
                title: {
                    display: true,
                    text: title,
                    color: '#1f2937',
                    font: {
                        size: 18,
                        weight: 'bold',
                        family: '"Times New Roman", Times, serif',
                    },
                    padding: {
                        top: 2,
                        bottom: 20,
                    },
                },
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false,
                        drawBorder: true,
                    },
                    ticks: {
                        color: '#1f2937',
                        font: {
                            size: 12,
                            weight: 'bold',
                            family: '"Times New Roman", Times, serif',
                        },
                        padding: 18,
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: false,
                        callback: function (value, index) {
                            return labels[index] || '';
                        },
                    },
                },
                y: {
                    display: true,
                    beginAtZero: true,
                    suggestedMax: suggestedMax || 100,
                    grid: {
                        display: true,
                        color: '#e5e7eb',
                        drawBorder: true,
                    },
                    ticks: {
                        color: '#1f2937',
                        font: {
                            size: 12,
                            family: '"Times New Roman", Times, serif',
                        },
                        padding: 3,
                        stepSize: Math.ceil(suggestedMax / 5),
                    },
                    title: yAxisLabel
                        ? {
                            display: true,
                            text: yAxisLabel,
                            color: '#1f2937',
                            font: {
                                size: 18,
                                weight: 'bold',
                                family: '"Times New Roman", Times, serif',
                            },
                            padding: { top: 2, bottom: 2 },
                        }
                        : undefined,
                },
            },
        },
        plugins: [
            {
                id: 'customDataLabels',
                afterDatasetDraw(chart) {
                    const ctx = chart.ctx;
                    chart.data.datasets.forEach((dataset, datasetIndex) => {
                        const meta = chart.getDatasetMeta(datasetIndex);
                        meta.data.forEach((bar, index) => {
                            const value = dataset.data[index] as number;
                            const formattedValue = value.toLocaleString('en-US', {
                                maximumFractionDigits: 2,
                            });
                            ctx.fillStyle = '#1f2937';
                            ctx.font = 'bold 14px "Times New Roman", Times, serif';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'bottom';
                            const x = bar.x;
                            const y = bar.y - 5;
                            ctx.fillText(formattedValue, x, y);
                        });
                    });
                },
            },
        ],
    };
    return chartCanvas.renderToBuffer(config, 'image/png');
}
