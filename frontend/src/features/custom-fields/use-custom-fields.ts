"use client";

import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchCustomFields, selectCustomFields } from "./custom-fields.slice";
import type { CustomField, CustomFieldRecordType } from "./custom-fields.types";

// Loads the custom fields in use of one record type for a component that needs them (a
// form, a record page, a list's filters) and returns the slice part: { data, status, error }.
export function useCustomFields(recordType: CustomFieldRecordType) {
  const dispatch = useAppDispatch();
  const fields = useAppSelector(selectCustomFields(recordType));

  useEffect(() => {
    void dispatch(fetchCustomFields(recordType));
  }, [dispatch, recordType]);

  return fields;
}

const NO_FIELDS: CustomField[] = [];

// The same for a form page, which must not draw its form before it knows the fields: a
// form takes its starting values once. `ready` is true once the fields are known, or could
// not be loaded; the form then works without them, and the API still checks every value.
export function useCustomFieldsForForm(recordType: CustomFieldRecordType): {
  fields: CustomField[];
  ready: boolean;
} {
  const { data, status } = useCustomFields(recordType);
  return { fields: data ?? NO_FIELDS, ready: data !== null || status === "failed" };
}
