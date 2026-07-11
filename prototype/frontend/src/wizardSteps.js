// The ordered new-case wizard steps, shared by the stepper and the flow
// controller. Kept out of the component file so fast-refresh stays happy.
export const WIZARD_STEPS = [
  { key: "qr", label: "取得" },
  { key: "location", label: "地點" },
  { key: "confirm", label: "確認" },
  { key: "judgment", label: "判定" },
  { key: "photo", label: "拍照" },
  { key: "save", label: "儲存" },
];

export const wizardIndex = (key) => WIZARD_STEPS.findIndex((s) => s.key === key);
