'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
export default function FuelReportsPage() {
    const router = useRouter();
    const reportOptions = [
        {
            title: 'Diesel Reports',
            options: [
                {
                    name: 'Weekly Diesel Report',
                    path: '/reports/fuel/diesel/weekly'
                }
            ]
        },
        {
            title: 'Petrol Reports',
            options: [
                {
                    name: 'Weekly Petrol Report',
                    path: '/reports/fuel/petrol/weekly'
                },
                {
                    name: 'Petrol Consumption Report',
                    path: '/reports/fuel/petrol/consumption'
                }
            ]
        },
        {
            title: 'Oil Reports',
            options: [
                {
                    name: 'Oil Consumption Report',
                    path: '/reports/fuel/oil/consumption'
                }
            ]
        }
    ];
    return (<div className="container mx-auto py-10">
      <h1 className="text-3xl font-extrabold mb-10 text-[#003594] tracking-tight">Fuel Reports</h1>
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {reportOptions.map((section) => (<Card key={section.title} className="shadow-lg rounded-xl border border-gray-200 bg-white hover:shadow-2xl transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-[#003594]">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {section.options.map((option) => (<Button key={option.name} variant="outline" className="w-full justify-start font-semibold border-[#003594] text-[#003594] hover:bg-[#003594] hover:text-white transition-colors" onClick={() => router.push(option.path)}>
                    {option.name}
                  </Button>))}
              </div>
            </CardContent>
          </Card>))}
      </div>
    </div>);
}
