import * as React from "react";
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { createTheme, ThemeProvider } from '@mui/material/styles';
const theme = createTheme({
    palette: {
        primary: {
            main: '#0f172a',
        },
        background: {
            paper: '#ffffff',
        },
    },
    components: {
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    borderRadius: '0.375rem',
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#e2e8f0',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#0f172a',
                    },
                },
                input: {
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                },
            },
        },
    },
});
interface CalendarProps {
    value?: Date;
    onChange?: (date: Date | null) => void;
    className?: string;
    minDate?: Date;
    maxDate?: Date;
}
function Calendar({ value, onChange, className, minDate, maxDate }: CalendarProps) {
    return (<ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <DateCalendar value={value || null} onChange={onChange} minDate={minDate} maxDate={maxDate} sx={{
            '& .MuiPickersDay-root.Mui-selected': {
                backgroundColor: '#0f172a',
                '&:hover': {
                    backgroundColor: '#1e293b',
                },
            },
            '& .MuiPickersDay-root:hover': {
                backgroundColor: '#f1f5f9',
            },
        }} className={className}/>
      </LocalizationProvider>
    </ThemeProvider>);
}
Calendar.displayName = "Calendar";
export { Calendar };
