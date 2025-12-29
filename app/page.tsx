// app/page.tsx
import React from "react";
import MicroNicheEngineFrontendPrototype from "@/components/MicroNicheEngineFrontendPrototype";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
    return <MicroNicheEngineFrontendPrototype />;
}
