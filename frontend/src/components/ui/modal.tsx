import * as React from "react";

import * as DialogPrimitive from "@radix-ui/react-dialog";

import { X } from "lucide-react";

import { cn } from "@/utils/utils";



const Modal = DialogPrimitive.Root;

const ModalTrigger = DialogPrimitive.Trigger;

const ModalPortal = DialogPrimitive.Portal;

const ModalClose = DialogPrimitive.Close;



const ModalOverlay = React.forwardRef<

    React.ElementRef<typeof DialogPrimitive.Overlay>,

    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>

>(({ className, ...props }, ref) => (

    <DialogPrimitive.Overlay

        ref={ref}

        className={cn(

            "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",

            className

        )}

        {...props}

    />

));

ModalOverlay.displayName = DialogPrimitive.Overlay.displayName;



const ModalContent = React.forwardRef<

    React.ElementRef<typeof DialogPrimitive.Content>,

    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>

>(({ className, children, ...props }, ref) => (

    <ModalPortal>

        <ModalOverlay />

        <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">

            <DialogPrimitive.Content

                ref={ref}

                className={cn(

                    "pointer-events-auto relative my-auto flex w-full max-w-lg flex-col gap-4",

                    "max-h-[min(92dvh,calc(100dvh-2rem))] overflow-hidden",

                    "border border-[#002a6e]/10 bg-white p-4 text-gray-900 shadow-xl",

                    "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",

                    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",

                    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",

                    "sm:rounded-2xl sm:p-6",

                    className

                )}

                {...props}

            >

                {children}

                <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm text-gray-500 opacity-70 transition-opacity hover:bg-gray-100 hover:text-gray-900 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#003594]/30 focus:ring-offset-2 disabled:pointer-events-none">

                    <X className="h-4 w-4" />

                    <span className="sr-only">Close</span>

                </DialogPrimitive.Close>

            </DialogPrimitive.Content>

        </div>

    </ModalPortal>

));

ModalContent.displayName = DialogPrimitive.Content.displayName;



const ModalHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (

    <div className={cn("flex shrink-0 flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />

);

ModalHeader.displayName = "ModalHeader";



const ModalFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (

    <div className={cn("flex shrink-0 flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />

);

ModalFooter.displayName = "ModalFooter";



const ModalTitle = React.forwardRef<

    React.ElementRef<typeof DialogPrimitive.Title>,

    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>

>(({ className, ...props }, ref) => (

    <DialogPrimitive.Title

        ref={ref}

        className={cn("text-lg font-semibold leading-none tracking-tight", className)}

        {...props}

    />

));

ModalTitle.displayName = DialogPrimitive.Title.displayName;



const ModalDescription = React.forwardRef<

    React.ElementRef<typeof DialogPrimitive.Description>,

    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>

>(({ className, ...props }, ref) => (

    <DialogPrimitive.Description

        ref={ref}

        className={cn("text-sm text-gray-600", className)}

        {...props}

    />

));

ModalDescription.displayName = DialogPrimitive.Description.displayName;



export {

    Modal,

    ModalPortal,

    ModalOverlay,

    ModalTrigger,

    ModalClose,

    ModalContent,

    ModalHeader,

    ModalFooter,

    ModalTitle,

    ModalDescription,

};


