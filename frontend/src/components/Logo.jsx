import koodhBeak from "@/assets/koodh-beak.png";

export function Logo({ className = "" }) {
  return (
    <img src={koodhBeak}
      alt="Clara Frames" draggable="false" className={`h-7 w-7 object-contain ${className}`} />
  );
}
