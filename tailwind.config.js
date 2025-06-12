/** @type {import('tailwindcss').Config} */
module.exports = {
    // NOTE: Update this to include the paths to all of your component files.
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                "primary": "#F97316",
                "custom-purple": "#76184F",
                "light-orange": "#FEF4EC",
                "custom-gray": "#F2F2F2",
            },
        },
    },
    plugins: [],
}
