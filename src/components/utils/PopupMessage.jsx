import React, { useEffect } from "react";

const PopupMessage = ({ message, type, visible, onClose }) => {
    const variantClasses = {
        success: "bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-emerald-950/10",
        warning: "bg-amber-50 text-amber-900 border border-amber-200 shadow-amber-950/10",
        error: "bg-rose-50 text-rose-900 border border-rose-200 shadow-rose-950/10",
        info: "bg-slate-50 text-slate-900 border border-slate-200 shadow-slate-950/10",
    };

    const popupClassName = variantClasses[type] || variantClasses.info;

    useEffect(() => {
        if (visible) {
            const timer = setTimeout(() => {
                onClose(); // Auto-close after 2 seconds
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [visible, onClose, message, type]);

    if (!visible) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-md shadow-lg text-sm font-medium transition-all duration-300 ${popupClassName}`}
        >
            <p>{message}</p>
        </div>
    );
};

export default PopupMessage;