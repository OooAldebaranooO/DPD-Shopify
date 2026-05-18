import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useActionData, Form } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await db.dpdConfig.findUnique({
    where: { shop: session.shop },
  });
  return { config };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const data = {
    agencyCode:     formData.get("agencyCode") as string,
    contractNumber: formData.get("contractNumber") as string,
    login:          formData.get("login") as string,
    password:       formData.get("password") as string,
    senderName:     formData.get("senderName") as string,
    senderAddress:  formData.get("senderAddress") as string,
    senderCity:     formData.get("senderCity") as string,
    senderZip:      formData.get("senderZip") as string,
    senderPhone:    formData.get("senderPhone") as string,
  };

  await db.dpdConfig.upsert({
    where:  { shop: session.shop },
    update: data,
    create: { shop: session.shop, ...data },
  });

  return { success: true };
};

export default function DpdConfigPage() {
  const { config } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Configuration DPD</h1>

      {actionData?.success && (
        <div style={{
          background: "#e6f4ea", border: "1px solid #34a853",
          borderRadius: 6, padding: "12px 16px", marginBottom: 24, color: "#1e7e34"
        }}>
          ✅ Configuration sauvegardée avec succès.
        </div>
      )}

      <Form method="post">
        <fieldset style={{ border: "1px solid #ddd", borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <legend style={{ fontWeight: "bold", padding: "0 8px" }}>Credentials DPD</legend>

          <Field label="Code agence" name="agencyCode" defaultValue={config?.agencyCode} placeholder="ex: 077" />
          <Field label="Numéro de contrat" name="contractNumber" defaultValue={config?.contractNumber} placeholder="ex: 18026" />
          <Field label="Login webservice" name="login" defaultValue={config?.login} />
          <Field label="Mot de passe webservice" name="password" defaultValue={config?.password} type="password" />
        </fieldset>

        <fieldset style={{ border: "1px solid #ddd", borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <legend style={{ fontWeight: "bold", padding: "0 8px" }}>Adresse expéditeur</legend>

          <Field label="Nom / Société" name="senderName" defaultValue={config?.senderName} />
          <Field label="Adresse" name="senderAddress" defaultValue={config?.senderAddress} />
          <Field label="Code postal" name="senderZip" defaultValue={config?.senderZip} />
          <Field label="Ville" name="senderCity" defaultValue={config?.senderCity} />
          <Field label="Téléphone" name="senderPhone" defaultValue={config?.senderPhone} placeholder="ex: 0600000000" />
        </fieldset>

        <button type="submit" style={{
          background: "#dc0032", color: "white", border: "none",
          borderRadius: 6, padding: "12px 32px", fontSize: 16,
          cursor: "pointer", fontWeight: "bold"
        }}>
          Sauvegarder
        </button>
      </Form>
    </div>
  );
}

function Field({ label, name, defaultValue, placeholder, type = "text" }: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontWeight: "bold", marginBottom: 4, fontSize: 14 }}>
        {label}
      </label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue || ""}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "8px 12px", border: "1px solid #ccc",
          borderRadius: 4, fontSize: 14, boxSizing: "border-box"
        }}
      />
    </div>
  );
}