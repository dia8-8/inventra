// The Inventra logo. There are two files because the lettering is dark on light pages
// and light on dark pages; the right one is shown for the current theme.
export default function BrandLogo({ className = "h-9" }) {
  return (
    <>
      <img src="/brand/inventra-logo.png" alt="Inventra" width="1000" height="237" className={`w-auto dark:hidden ${className}`} />
      <img src="/brand/inventra-logo-dark.png" alt="" aria-hidden="true" width="1000" height="237" className={`hidden w-auto dark:block ${className}`} />
    </>
  );
}
