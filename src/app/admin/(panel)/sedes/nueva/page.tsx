import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { saveLocationAction } from "../../../_actions/catalog";
import { adminContext } from "../../../_lib/context";
import { LocationForm } from "../location-form";

export const metadata: Metadata = { title: "Nueva sede" };

export default async function NewLocationPage() {
  await adminContext();
  return (
    <>
      <PageHeader title="Nueva sede" />
      <LocationForm action={saveLocationAction.bind(null, null)} />
    </>
  );
}
