"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FullPageSpinner } from "@/components/ui/spinner";
export default function RedirectToDashboard() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/dashboard");
    }, [router]);
    return <FullPageSpinner />;
}
