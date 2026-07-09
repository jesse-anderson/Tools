// ============================================
// Unit Converter
// ============================================

(function() {
'use strict';

// ============================================
// Exact primitive definitions
// ============================================
// Every derived factor below is written as an expression of these anchors
// rather than a hand-typed decimal, so the full ~15 significant figures of a
// double carry through instead of a value pre-rounded to 7-10 figures. A
// pre-rounded literal (slug = 14.593903) injects ~1e-7 relative error that
// shows up in the tool's 10 sig fig display. Only these anchors, pure metric
// decade factors, and conventional reference constants (mmHg, inHg, Mach, c,
// eV) stay as literals.
const IN = 0.0254;               // metre, international inch (exact)
const FT = 12 * IN;              // 0.3048 m, foot
const YD = 3 * FT;               // 0.9144 m, yard
const MI = 5280 * FT;            // 1609.344 m, statute mile
const LB = 0.45359237;           // kilogram, avoirdupois pound (exact)
const G0 = 9.80665;              // m/s^2, standard gravity (exact)
const LBF = LB * G0;             // 4.4482216152605 N, pound-force
const GAL = 3.785411784;         // litre, US gallon = 231 in^3 (exact)
const FT3 = 1000 * FT * FT * FT; // 28.316846592 L, cubic foot
const CAL_TH = 4.184;            // joule, thermochemical calorie (exact)
const CAL_IT = 4.1868;           // joule, International Table calorie (exact)
const BTU = 1055.05585262;       // joule, IT BTU (exact by definition)

    // ============================================
    // Unit Definitions
    // ============================================
    const unitData = {
    length: {
        name: 'Length',
        icon: '📏',
        baseUnit: 'm',
        units: {
            'm': { name: 'Meters', factor: 1 },
            'km': { name: 'Kilometers', factor: 1000 },
            'cm': { name: 'Centimeters', factor: 0.01 },
            'mm': { name: 'Millimeters', factor: 0.001 },
            'μm': { name: 'Micrometers', factor: 1e-6 },
            'nm': { name: 'Nanometers', factor: 1e-9 },
            'in': { name: 'Inches', factor: IN },
            'ft': { name: 'Feet', factor: FT },
            'yd': { name: 'Yards', factor: YD },
            'mi': { name: 'Miles', factor: MI },
            'nmi': { name: 'Nautical Miles', factor: 1852 },
            'mil': { name: 'Mils (thou)', factor: IN / 1000 },
            'Å': { name: 'Angstroms', factor: 1e-10 }
        },
        quickRefs: [
            { from: '1 in', to: '25.4 mm' },
            { from: '1 ft', to: '0.3048 m' },
            { from: '1 mi', to: '1.609 km' },
            { from: '1 m', to: '3.281 ft' }
        ]
    },
    mass: {
        name: 'Mass',
        icon: '⚖️',
        baseUnit: 'kg',
        units: {
            'kg': { name: 'Kilograms', factor: 1 },
            'g': { name: 'Grams', factor: 0.001 },
            'mg': { name: 'Milligrams', factor: 1e-6 },
            'μg': { name: 'Micrograms', factor: 1e-9 },
            'tonne': { name: 'Metric Tons', factor: 1000 },
            'lb': { name: 'Pounds', factor: LB },
            'oz': { name: 'Ounces', factor: LB / 16 },
            'ton': { name: 'Short Tons (US)', factor: 2000 * LB },
            'ton_uk': { name: 'Long Tons (UK)', factor: 2240 * LB },
            'st': { name: 'Stones', factor: 14 * LB },
            'gr': { name: 'Grains', factor: LB / 7000 },
            'slug': { name: 'Slugs', factor: LBF / FT }
        },
        quickRefs: [
            { from: '1 lb', to: '0.4536 kg' },
            { from: '1 kg', to: '2.205 lb' },
            { from: '1 oz', to: '28.35 g' },
            { from: '1 ton', to: '0.9072 tonne' }
        ]
    },
    volume: {
        name: 'Volume',
        icon: '🧪',
        baseUnit: 'L',
        units: {
            'L': { name: 'Liters', factor: 1 },
            'dL': { name: 'Deciliters', factor: 0.1 },
            'mL': { name: 'Milliliters', factor: 0.001 },
            'μL': { name: 'Microliters', factor: 1e-6 },
            'm³': { name: 'Cubic Meters', factor: 1000 },
            'cm³': { name: 'Cubic Centimeters', factor: 0.001 },
            'mm³': { name: 'Cubic Millimeters', factor: 1e-6 },
            'gal': { name: 'US Gallons', factor: GAL },
            'gal_uk': { name: 'UK Gallons', factor: 4.54609 },
            'qt': { name: 'US Quarts', factor: GAL / 4 },
            'pt': { name: 'US Pints', factor: GAL / 8 },
            'cup': { name: 'US Cups', factor: GAL / 16 },
            'fl_oz': { name: 'US Fluid Ounces', factor: GAL / 128 },
            'tbsp': { name: 'Tablespoons', factor: GAL / 256 },
            'tsp': { name: 'Teaspoons', factor: GAL / 768 },
            'ft³': { name: 'Cubic Feet', factor: FT3 },
            'in³': { name: 'Cubic Inches', factor: 1000 * IN * IN * IN },
            'yd³': { name: 'Cubic Yards', factor: 27 * FT3 },
            'bbl': { name: 'Oil Barrels (US)', factor: 42 * GAL },
            'bbl_uk': { name: 'UK Barrels', factor: 36 * 4.54609 },
            'acre·ft': { name: 'Acre-feet', factor: 43560 * FT3 }
        },
        quickRefs: [
            { from: '1 gal', to: '3.785 L' },
            { from: '1 L', to: '0.2642 gal' },
            { from: '1 ft³', to: '28.32 L' },
            { from: '1 bbl', to: '159 L' }
        ]
    },
    temperature: {
        name: 'Temperature',
        icon: '🌡️',
        baseUnit: 'K',
        special: true,
        units: {
            '°C': { name: 'Celsius' },
            '°F': { name: 'Fahrenheit' },
            'K': { name: 'Kelvin' },
            '°R': { name: 'Rankine' }
        },
        quickRefs: [
            { from: '0 °C', to: '32 °F' },
            { from: '100 °C', to: '212 °F' },
            { from: '0 K', to: '-273.15 °C' },
            { from: '25 °C', to: '77 °F' }
        ]
    },
    pressure: {
        name: 'Pressure',
        icon: '💨',
        baseUnit: 'Pa',
        units: {
            'Pa': { name: 'Pascals', factor: 1 },
            'hPa': { name: 'Hectopascals', factor: 100 },
            'kPa': { name: 'Kilopascals', factor: 1000 },
            'MPa': { name: 'Megapascals', factor: 1e6 },
            'GPa': { name: 'Gigapascals', factor: 1e9 },
            'bar': { name: 'Bar', factor: 100000 },
            'mbar': { name: 'Millibar', factor: 100 },
            'atm': { name: 'Atmospheres', factor: 101325 },
            'psi': { name: 'PSI', factor: LBF / (IN * IN) },
            'ksi': { name: 'KSI', factor: 1000 * LBF / (IN * IN) },
            'psf': { name: 'PSF', factor: LBF / (FT * FT) },
            'mmHg': { name: 'mmHg (conventional)', factor: 133.322387415 },
            'Torr': { name: 'Torr (atm/760)', factor: 101325 / 760 },
            'inHg': { name: 'Inches Hg', factor: 3386.389 },
            'mmH₂O': { name: 'mm Water', factor: G0 },
            'inH₂O': { name: 'Inches Water', factor: 1000 * IN * G0 },
            'ftH₂O': { name: 'Feet Water', factor: 1000 * FT * G0 },
            'kg/cm²': { name: 'kg/cm²', factor: 10000 * G0 },
            'N/mm²': { name: 'N/mm²', factor: 1e6 }
        },
        quickRefs: [
            { from: '1 atm', to: '101.325 kPa' },
            { from: '1 atm', to: '14.696 psi' },
            { from: '1 bar', to: '14.504 psi' },
            { from: '1 psi', to: '6.895 kPa' }
        ]
    },
    energy: {
        name: 'Energy',
        icon: '⚡',
        baseUnit: 'J',
        units: {
            'J': { name: 'Joules', factor: 1 },
            'kJ': { name: 'Kilojoules', factor: 1000 },
            'MJ': { name: 'Megajoules', factor: 1e6 },
            'GJ': { name: 'Gigajoules', factor: 1e9 },
            'cal': { name: 'Calories', factor: CAL_TH },
            'kcal': { name: 'Kilocalories', factor: 1000 * CAL_TH },
            'BTU': { name: 'BTU', factor: BTU },
            'MMBTU': { name: 'MMBTU', factor: 1e6 * BTU },
            'therm': { name: 'Therms', factor: 1e5 * BTU },
            'Wh': { name: 'Watt-hours', factor: 3600 },
            'kWh': { name: 'Kilowatt-hours', factor: 3600000 },
            'MWh': { name: 'Megawatt-hours', factor: 3.6e9 },
            'eV': { name: 'Electron Volts', factor: 1.602176634e-19 },
            'ft·lbf': { name: 'Foot-pounds', factor: FT * LBF },
            'erg': { name: 'Ergs', factor: 1e-7 },
            'hp·h': { name: 'Horsepower-hours', factor: 550 * FT * LBF * 3600 }
        },
        quickRefs: [
            { from: '1 BTU', to: '1.055 kJ' },
            { from: '1 kWh', to: '3.6 MJ' },
            { from: '1 kcal', to: '4.184 kJ' },
            { from: '1 therm', to: '105.5 MJ' }
        ]
    },
    power: {
        name: 'Power',
        icon: '🔌',
        baseUnit: 'W',
        units: {
            'W': { name: 'Watts', factor: 1 },
            'kW': { name: 'Kilowatts', factor: 1000 },
            'MW': { name: 'Megawatts', factor: 1e6 },
            'GW': { name: 'Gigawatts', factor: 1e9 },
            'mW': { name: 'Milliwatts', factor: 0.001 },
            'hp': { name: 'Horsepower (mech)', factor: 550 * FT * LBF },
            'hp_m': { name: 'Horsepower (metric)', factor: 75 * G0 },
            'hp_e': { name: 'Horsepower (elec)', factor: 746 },
            'BTU/hr': { name: 'BTU/hour', factor: BTU / 3600 },
            'BTU/min': { name: 'BTU/minute', factor: BTU / 60 },
            'BTU/s': { name: 'BTU/second', factor: BTU },
            'ton_ref': { name: 'Tons Refrig.', factor: 12000 * BTU / 3600 },
            'cal/s': { name: 'Calories/sec', factor: CAL_IT },
            'kcal/hr': { name: 'kcal/hour', factor: 1000 * CAL_IT / 3600 },
            'ft·lbf/s': { name: 'ft·lbf/sec', factor: FT * LBF },
            'J/s': { name: 'Joules/sec', factor: 1 }
        },
        quickRefs: [
            { from: '1 hp', to: '0.7457 kW' },
            { from: '1 kW', to: '3412 BTU/hr' },
            { from: '1 ton', to: '3.517 kW' },
            { from: '1 MW', to: '1341 hp' }
        ]
    },
    flowVolumetric: {
        name: 'Flow (Volumetric)',
        icon: '🌊',
        baseUnit: 'L/s',
        units: {
            'L/s': { name: 'Liters/sec', factor: 1 },
            'L/min': { name: 'Liters/min', factor: 1/60 },
            'L/hr': { name: 'Liters/hour', factor: 1/3600 },
            'mL/min': { name: 'mL/min', factor: 1/60000 },
            'm³/s': { name: 'm³/sec', factor: 1000 },
            'm³/min': { name: 'm³/min', factor: 1000/60 },
            'm³/hr': { name: 'm³/hour', factor: 1000/3600 },
            'm³/day': { name: 'm³/day', factor: 1000/86400 },
            'gpm': { name: 'US gal/min', factor: GAL / 60 },
            'gph': { name: 'US gal/hour', factor: GAL / 3600 },
            'gpd': { name: 'US gal/day', factor: GAL / 86400 },
            'cfm': { name: 'ft³/min (CFM)', factor: FT3 / 60 },
            'cfs': { name: 'ft³/sec (CFS)', factor: FT3 },
            'cfh': { name: 'ft³/hour', factor: FT3 / 3600 },
            'bbl/day': { name: 'Barrels/day', factor: 42 * GAL / 86400 },
            'MGD': { name: 'Million gal/day', factor: 1e6 * GAL / 86400 },
            'SCFM': { name: 'Std ft³/min', factor: FT3 / 60 }
        },
        quickRefs: [
            { from: '1 gpm', to: '3.785 L/min' },
            { from: '1 cfm', to: '28.32 L/min' },
            { from: '1 m³/hr', to: '4.403 gpm' },
            { from: '1 bbl/day', to: '0.006624 m³/hr' }
        ]
    },
    flowMass: {
        name: 'Flow (Mass)',
        icon: '📊',
        baseUnit: 'kg/s',
        units: {
            'kg/s': { name: 'kg/sec', factor: 1 },
            'kg/min': { name: 'kg/min', factor: 1/60 },
            'kg/hr': { name: 'kg/hour', factor: 1/3600 },
            'kg/day': { name: 'kg/day', factor: 1/86400 },
            'g/s': { name: 'g/sec', factor: 0.001 },
            'g/min': { name: 'g/min', factor: 0.001/60 },
            'tonne/hr': { name: 'tonne/hour', factor: 1000/3600 },
            'tonne/day': { name: 'tonne/day', factor: 1000/86400 },
            'lb/s': { name: 'lb/sec', factor: LB },
            'lb/min': { name: 'lb/min', factor: LB / 60 },
            'lb/hr': { name: 'lb/hour', factor: LB / 3600 },
            'ton/hr': { name: 'Short ton/hr', factor: 2000 * LB / 3600 },
            'ton/day': { name: 'Short ton/day', factor: 2000 * LB / 86400 }
        },
        quickRefs: [
            { from: '1 lb/hr', to: '0.4536 kg/hr' },
            { from: '1 kg/s', to: '7936.6 lb/hr' },
            { from: '1 tonne/hr', to: '2205 lb/hr' },
            { from: '1000 lb/hr', to: '0.454 tonne/hr' }
        ]
    },
    density: {
        name: 'Density',
        icon: '🧊',
        baseUnit: 'kg/m³',
        units: {
            'kg/m³': { name: 'kg/m³', factor: 1 },
            'g/cm³': { name: 'g/cm³', factor: 1000 },
            'g/mL': { name: 'g/mL', factor: 1000 },
            'kg/L': { name: 'kg/L', factor: 1000 },
            'g/L': { name: 'g/L', factor: 1 },
            'mg/mL': { name: 'mg/mL', factor: 1 },
            'lb/ft³': { name: 'lb/ft³', factor: LB / (FT * FT * FT) },
            'lb/in³': { name: 'lb/in³', factor: LB / (IN * IN * IN) },
            'lb/gal': { name: 'lb/US gal', factor: 1000 * LB / GAL },
            'lb/gal_uk': { name: 'lb/UK gal', factor: 1000 * LB / 4.54609 },
            'slug/ft³': { name: 'slug/ft³', factor: (LBF / FT) / (FT * FT * FT) },
            'oz/in³': { name: 'oz/in³', factor: (LB / 16) / (IN * IN * IN) },
            'tonne/m³': { name: 'tonne/m³', factor: 1000 },
            'SG': { name: 'Specific Gravity', factor: 1000 }
        },
        quickRefs: [
            { from: '1 g/cm³', to: '62.43 lb/ft³' },
            { from: '1 lb/ft³', to: '16.02 kg/m³' },
            { from: '1 lb/gal', to: '119.8 kg/m³' },
            { from: '1 SG', to: '8.345 lb/gal' }
        ]
    },
    viscosityDynamic: {
        name: 'Viscosity (Dynamic)',
        icon: '🍯',
        baseUnit: 'Pa·s',
        units: {
            'Pa·s': { name: 'Pascal-seconds', factor: 1 },
            'mPa·s': { name: 'mPa·s', factor: 0.001 },
            'P': { name: 'Poise', factor: 0.1 },
            'cP': { name: 'Centipoise', factor: 0.001 },
            'kg/(m·s)': { name: 'kg/(m·s)', factor: 1 },
            'N·s/m²': { name: 'N·s/m²', factor: 1 },
            'lb/(ft·s)': { name: 'lb/(ft·s)', factor: LB / FT },
            'lb/(ft·hr)': { name: 'lb/(ft·hr)', factor: LB / FT / 3600 },
            'lbf·s/ft²': { name: 'lbf·s/ft²', factor: LBF / (FT * FT) },
            'lbf·s/in²': { name: 'Reyn', factor: LBF / (IN * IN) },
            'slug/(ft·s)': { name: 'slug/(ft·s)', factor: LBF / (FT * FT) }
        },
        quickRefs: [
            { from: '1 cP', to: '0.001 Pa·s' },
            { from: '1 P', to: '100 cP' },
            { from: '1 lb/(ft·s)', to: '1488 cP' },
            { from: 'Water@20°C', to: '1.002 cP' }
        ]
    },
    viscosityKinematic: {
        name: 'Viscosity (Kinematic)',
        icon: '💧',
        baseUnit: 'm²/s',
        units: {
            'm²/s': { name: 'm²/s', factor: 1 },
            'mm²/s': { name: 'mm²/s', factor: 1e-6 },
            'cm²/s': { name: 'cm²/s (Stokes)', factor: 1e-4 },
            'St': { name: 'Stokes', factor: 1e-4 },
            'cSt': { name: 'Centistokes', factor: 1e-6 },
            'ft²/s': { name: 'ft²/s', factor: FT * FT },
            'ft²/hr': { name: 'ft²/hr', factor: FT * FT / 3600 },
            'in²/s': { name: 'in²/s', factor: IN * IN }
        },
        quickRefs: [
            { from: '1 cSt', to: '1 mm²/s' },
            { from: '1 St', to: '100 cSt' },
            { from: '1 ft²/s', to: '92903 cSt' },
            { from: 'Water@20°C', to: '1.004 cSt' }
        ]
    },
    force: {
        name: 'Force',
        icon: '💪',
        baseUnit: 'N',
        units: {
            'N': { name: 'Newtons', factor: 1 },
            'kN': { name: 'Kilonewtons', factor: 1000 },
            'MN': { name: 'Meganewtons', factor: 1e6 },
            'mN': { name: 'Millinewtons', factor: 0.001 },
            'dyn': { name: 'Dynes', factor: 1e-5 },
            'kgf': { name: 'Kilogram-force', factor: G0 },
            'gf': { name: 'Gram-force', factor: G0 / 1000 },
            'lbf': { name: 'Pound-force', factor: LBF },
            'kip': { name: 'Kips', factor: 1000 * LBF },
            'ozf': { name: 'Ounce-force', factor: LBF / 16 },
            'tonf': { name: 'Short ton-force', factor: 2000 * LBF },
            'tonf_uk': { name: 'Long ton-force', factor: 2240 * LBF },
            'pdl': { name: 'Poundals', factor: LB * FT }
        },
        quickRefs: [
            { from: '1 lbf', to: '4.448 N' },
            { from: '1 kgf', to: '9.807 N' },
            { from: '1 kN', to: '224.8 lbf' },
            { from: '1 kip', to: '4.448 kN' }
        ]
    },
    area: {
        name: 'Area',
        icon: '⬛',
        baseUnit: 'm²',
        units: {
            'm²': { name: 'Square Meters', factor: 1 },
            'km²': { name: 'Square Kilometers', factor: 1e6 },
            'cm²': { name: 'Square Centimeters', factor: 1e-4 },
            'mm²': { name: 'Square Millimeters', factor: 1e-6 },
            'ha': { name: 'Hectares', factor: 10000 },
            'are': { name: 'Ares', factor: 100 },
            'ft²': { name: 'Square Feet', factor: FT * FT },
            'in²': { name: 'Square Inches', factor: IN * IN },
            'yd²': { name: 'Square Yards', factor: YD * YD },
            'mi²': { name: 'Square Miles', factor: MI * MI },
            'acre': { name: 'Acres', factor: 43560 * FT * FT },
            'circ_mil': { name: 'Circular Mils', factor: Math.PI / 4 * (IN / 1000) * (IN / 1000) }
        },
        quickRefs: [
            { from: '1 ft²', to: '0.0929 m²' },
            { from: '1 acre', to: '4047 m²' },
            { from: '1 ha', to: '2.471 acres' },
            { from: '1 mi²', to: '640 acres' }
        ]
    },
    velocity: {
        name: 'Velocity',
        icon: '🚀',
        baseUnit: 'm/s',
        units: {
            'm/s': { name: 'Meters/sec', factor: 1 },
            'km/h': { name: 'km/hour', factor: 1/3.6 },
            'km/s': { name: 'km/sec', factor: 1000 },
            'cm/s': { name: 'cm/sec', factor: 0.01 },
            'mm/s': { name: 'mm/sec', factor: 0.001 },
            'mph': { name: 'Miles/hour', factor: MI / 3600 },
            'fps': { name: 'Feet/sec', factor: FT },
            'fpm': { name: 'Feet/min', factor: FT / 60 },
            'fph': { name: 'Feet/hour', factor: FT / 3600 },
            'ips': { name: 'Inches/sec', factor: IN },
            'kn': { name: 'Knots', factor: 1852 / 3600 },
            'mach': { name: 'Mach (@sea level)', factor: 340.29 },
            'c': { name: 'Speed of Light', factor: 299792458 }
        },
        quickRefs: [
            { from: '1 m/s', to: '3.281 ft/s' },
            { from: '1 mph', to: '1.609 km/h' },
            { from: '1 kn', to: '1.852 km/h' },
            { from: '100 km/h', to: '62.14 mph' }
        ]
    },
    time: {
        name: 'Time',
        icon: '⏱️',
        baseUnit: 's',
        units: {
            's': { name: 'Seconds', factor: 1 },
            'ms': { name: 'Milliseconds', factor: 0.001 },
            'μs': { name: 'Microseconds', factor: 1e-6 },
            'ns': { name: 'Nanoseconds', factor: 1e-9 },
            'min': { name: 'Minutes', factor: 60 },
            'hr': { name: 'Hours', factor: 3600 },
            'day': { name: 'Days', factor: 86400 },
            'week': { name: 'Weeks', factor: 604800 },
            'month': { name: 'Months (30d)', factor: 2592000 },
            'year': { name: 'Years (365d)', factor: 31536000 }
        },
        quickRefs: [
            { from: '1 hr', to: '3600 s' },
            { from: '1 day', to: '86400 s' },
            { from: '1 week', to: '168 hr' },
            { from: '1 year', to: '8760 hr' }
        ]
    },
    torque: {
        name: 'Torque',
        icon: '🔧',
        baseUnit: 'N·m',
        units: {
            'N·m': { name: 'Newton-meters', factor: 1 },
            'kN·m': { name: 'Kilonewton-meters', factor: 1000 },
            'N·cm': { name: 'Newton-cm', factor: 0.01 },
            'N·mm': { name: 'Newton-mm', factor: 0.001 },
            'kgf·m': { name: 'kgf-meters', factor: G0 },
            'kgf·cm': { name: 'kgf-cm', factor: G0 / 100 },
            'gf·cm': { name: 'gf-cm', factor: G0 / 100000 },
            'lbf·ft': { name: 'Pound-feet', factor: FT * LBF },
            'lbf·in': { name: 'Pound-inches', factor: IN * LBF },
            'ozf·in': { name: 'Ounce-inches', factor: IN * LBF / 16 },
            'dyn·cm': { name: 'Dyne-cm', factor: 1e-7 }
        },
        quickRefs: [
            { from: '1 lbf·ft', to: '1.356 N·m' },
            { from: '1 N·m', to: '0.7376 lbf·ft' },
            { from: '1 kgf·m', to: '9.807 N·m' },
            { from: '1 lbf·in', to: '0.1130 N·m' }
        ]
    },
    thermalConductivity: {
        name: 'Thermal Conductivity',
        icon: '🔥',
        baseUnit: 'W/(m·K)',
        units: {
            'W/(m·K)': { name: 'W/(m·K)', factor: 1 },
            'W/(m·°C)': { name: 'W/(m·°C)', factor: 1 },
            'kW/(m·K)': { name: 'kW/(m·K)', factor: 1000 },
            'W/(cm·K)': { name: 'W/(cm·K)', factor: 100 },
            'mW/(m·K)': { name: 'mW/(m·K)', factor: 0.001 },
            'BTU/(hr·ft·°F)': { name: 'BTU/(hr·ft·°F)', factor: BTU / (3600 * FT * (5 / 9)) },
            'BTU·in/(hr·ft²·°F)': { name: 'BTU·in/(hr·ft²·°F)', factor: BTU / (3600 * FT * (5 / 9)) / 12 },
            'cal/(s·cm·°C)': { name: 'cal/(s·cm·°C)', factor: CAL_TH / 0.01 },
            'kcal/(hr·m·°C)': { name: 'kcal/(hr·m·°C)', factor: 1000 * CAL_IT / 3600 }
        },
        quickRefs: [
            { from: '1 BTU/(hr·ft·°F)', to: '1.731 W/(m·K)' },
            { from: '1 W/(m·K)', to: '0.578 BTU/(hr·ft·°F)' },
            { from: 'Copper', to: '~401 W/(m·K)' },
            { from: 'Steel', to: '~50 W/(m·K)' }
        ]
    },
    specificHeat: {
        name: 'Specific Heat',
        icon: '♨️',
        baseUnit: 'J/(kg·K)',
        units: {
            'J/(kg·K)': { name: 'J/(kg·K)', factor: 1 },
            'J/(kg·°C)': { name: 'J/(kg·°C)', factor: 1 },
            'kJ/(kg·K)': { name: 'kJ/(kg·K)', factor: 1000 },
            'J/(g·K)': { name: 'J/(g·K)', factor: 1000 },
            'cal/(g·°C)': { name: 'cal/(g·°C)', factor: 1000 * CAL_TH },
            'kcal/(kg·°C)': { name: 'kcal/(kg·°C)', factor: 1000 * CAL_TH },
            'BTU/(lb·°F)': { name: 'BTU/(lb·°F)', factor: BTU / (LB * (5 / 9)) },
            'BTU/(lb·°R)': { name: 'BTU/(lb·°R)', factor: BTU / (LB * (5 / 9)) }
        },
        quickRefs: [
            { from: '1 BTU/(lb·°F)', to: '4.187 kJ/(kg·K)' },
            { from: '1 cal/(g·°C)', to: '4.184 kJ/(kg·K)' },
            { from: 'Water', to: '4.186 kJ/(kg·K)' },
            { from: 'Air', to: '1.005 kJ/(kg·K)' }
        ]
    },
    concentration: {
        name: 'Concentration',
        icon: '🔬',
        baseUnit: 'mol/L',
        units: {
            'mol/L': { name: 'mol/L (M)', factor: 1 },
            'mmol/L': { name: 'mmol/L (mM)', factor: 0.001 },
            'μmol/L': { name: 'μmol/L (μM)', factor: 1e-6 },
            'nmol/L': { name: 'nmol/L (nM)', factor: 1e-9 },
            'mol/m³': { name: 'mol/m³', factor: 0.001 },
            'kmol/m³': { name: 'kmol/m³', factor: 1 },
            'mol/mL': { name: 'mol/mL', factor: 1000 },
            'eq/L': { name: 'eq/L (N)', factor: 1 },
            'meq/L': { name: 'meq/L', factor: 0.001 }
        },
        quickRefs: [
            { from: '1 M', to: '1000 mM' },
            { from: '1 mol/L', to: '1000 mol/m³' },
            { from: '1 meq/L', to: '1 mmol/L (mono)' },
            { from: '1 N', to: '1 M (mono)' }
        ]
    },
    angle: {
        name: 'Angle',
        icon: '📐',
        baseUnit: 'rad',
        units: {
            'rad': { name: 'Radians', factor: 1 },
            'mrad': { name: 'Milliradians', factor: 0.001 },
            'deg': { name: 'Degrees', factor: Math.PI / 180 },
            'grad': { name: 'Gradians (gon)', factor: Math.PI / 200 },
            'arcmin': { name: 'Arcminutes', factor: Math.PI / 10800 },
            'arcsec': { name: 'Arcseconds', factor: Math.PI / 648000 },
            'rev': { name: 'Revolutions', factor: 2 * Math.PI }
        },
        quickRefs: [
            { from: '180 deg', to: '3.14159 rad' },
            { from: '1 rev', to: '360 deg' },
            { from: '1 rev', to: '400 grad' },
            { from: '1 deg', to: '60 arcmin' }
        ]
    },
    frequency: {
        name: 'Frequency',
        icon: '📡',
        baseUnit: 'Hz',
        units: {
            'Hz': { name: 'Hertz', factor: 1 },
            'mHz': { name: 'Millihertz', factor: 0.001 },
            'kHz': { name: 'Kilohertz', factor: 1000 },
            'MHz': { name: 'Megahertz', factor: 1e6 },
            'GHz': { name: 'Gigahertz', factor: 1e9 },
            'rpm': { name: 'Rev/minute (RPM)', factor: 1 / 60 },
            'rps': { name: 'Rev/second', factor: 1 },
            'rad/s': { name: 'Radians/sec', factor: 1 / (2 * Math.PI) },
            'deg/s': { name: 'Degrees/sec', factor: 1 / 360 }
        },
        quickRefs: [
            { from: '60 rpm', to: '1 Hz' },
            { from: '1 Hz', to: '6.28319 rad/s' },
            { from: '1 kHz', to: '1000 Hz' },
            { from: '3600 rpm', to: '60 Hz' }
        ]
    },
    data: {
        name: 'Data Storage',
        icon: '💾',
        baseUnit: 'B',
        units: {
            'bit': { name: 'Bits', factor: 0.125 },
            'B': { name: 'Bytes', factor: 1 },
            'KB': { name: 'Kilobytes (10³)', factor: 1e3 },
            'MB': { name: 'Megabytes (10⁶)', factor: 1e6 },
            'GB': { name: 'Gigabytes (10⁹)', factor: 1e9 },
            'TB': { name: 'Terabytes (10¹²)', factor: 1e12 },
            'PB': { name: 'Petabytes (10¹⁵)', factor: 1e15 },
            'KiB': { name: 'Kibibytes (2¹⁰)', factor: 1024 },
            'MiB': { name: 'Mebibytes (2²⁰)', factor: 1048576 },
            'GiB': { name: 'Gibibytes (2³⁰)', factor: 1073741824 },
            'TiB': { name: 'Tebibytes (2⁴⁰)', factor: 1099511627776 },
            'PiB': { name: 'Pebibytes (2⁵⁰)', factor: 1125899906842624 }
        },
        quickRefs: [
            { from: '1 KiB', to: '1024 B' },
            { from: '1 MB', to: '1000 KB' },
            { from: '8 bit', to: '1 B' },
            { from: '1 GiB', to: '1073741824 B' }
        ]
    }
};

// ============================================
// Converter Logic
// ============================================
let currentCategory = 'length';
let elements = null;

// Raw (unrounded) result of the last successful conversion; swapUnits feeds
// this back as the new input so repeated swaps don't accumulate rounding
// drift from the 10-significant-figure display.
let lastRawResult = null;

// Initialize
function init() {
    // Looked up at init rather than at script parse time so the tool does
    // not depend on where the script tag sits relative to the markup.
    elements = {
        categoryList: document.getElementById('uc-categoryList'),
        panelIcon: document.getElementById('uc-panelIcon'),
        panelTitle: document.getElementById('uc-panelTitle'),
        fromValue: document.getElementById('uc-fromValue'),
        fromUnit: document.getElementById('uc-fromUnit'),
        toValue: document.getElementById('uc-toValue'),
        toUnit: document.getElementById('uc-toUnit'),
        resultValue: document.getElementById('uc-resultValue'),
        resultFormula: document.getElementById('uc-resultFormula'),
        resultNote: document.getElementById('uc-resultNote'),
        referenceGrid: document.getElementById('uc-referenceGrid'),
        swapBtn: document.getElementById('uc-swapBtn'),
        copyBtn: document.getElementById('uc-copyBtn')
    };

    bindCategoryEvents();
    bindInputEvents();
    loadCategory(currentCategory);
}

function bindCategoryEvents() {
    const categoryItems = elements.categoryList.querySelectorAll('.category-item');

    // Roving tabindex: exactly one category is tabbable at a time, so the
    // list is a single Tab stop and arrow keys move within it.
    function setRovingFocus(item) {
        categoryItems.forEach(el => {
            el.setAttribute('tabindex', el === item ? '0' : '-1');
        });
        item.focus();
    }

    // Handle category selection (both click and keyboard activation)
    function selectCategory(item) {
        const activeItem = document.querySelector('.category-item.active');
        if (activeItem) {
            activeItem.classList.remove('active');
            activeItem.setAttribute('aria-selected', 'false');
        }
        item.classList.add('active');
        item.setAttribute('aria-selected', 'true');
        setRovingFocus(item);
        loadCategory(item.dataset.category);
    }

    categoryItems.forEach(item => {
        // Click handler
        item.addEventListener('click', () => selectCategory(item));

        // Keyboard handler
        item.addEventListener('keydown', (e) => {
            // Activate on Enter or Space
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectCategory(item);
                return;
            }

            // Arrow key navigation
            const items = Array.from(categoryItems);
            const currentIndex = items.indexOf(item);

            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                const nextIndex = (currentIndex + 1) % items.length;
                setRovingFocus(items[nextIndex]);
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const prevIndex = (currentIndex - 1 + items.length) % items.length;
                setRovingFocus(items[prevIndex]);
            } else if (e.key === 'Home') {
                e.preventDefault();
                setRovingFocus(items[0]);
            } else if (e.key === 'End') {
                e.preventDefault();
                setRovingFocus(items[items.length - 1]);
            }
        });
    });

    elements.swapBtn.addEventListener('click', swapUnits);

    // Copy button handler
    if (elements.copyBtn) {
        elements.copyBtn.addEventListener('click', handleCopyResult);
    }
}

function bindInputEvents() {
    elements.fromValue.addEventListener('input', debounce(convert, 50));
    elements.fromUnit.addEventListener('change', convert);
    elements.toUnit.addEventListener('change', convert);
}

function loadCategory(category) {
    currentCategory = category;
    const data = unitData[category];

    elements.panelIcon.textContent = data.icon;
    elements.panelTitle.textContent = data.name;

    // Populate unit dropdowns
    const unitKeys = Object.keys(data.units);

    elements.fromUnit.innerHTML = unitKeys.map(key =>
        `<option value="${key}">${key} — ${data.units[key].name}</option>`
    ).join('');

    elements.toUnit.innerHTML = unitKeys.map(key =>
        `<option value="${key}">${key} — ${data.units[key].name}</option>`
    ).join('');

    // Set sensible defaults (first and second units)
    elements.fromUnit.selectedIndex = 0;
    elements.toUnit.selectedIndex = Math.min(1, unitKeys.length - 1);

    // Set default value
    elements.fromValue.value = 1;

    // Load quick references
    loadQuickReferences(data.quickRefs);

    convert();
}

function loadQuickReferences(refs) {
    elements.referenceGrid.innerHTML = refs.map(ref => `
        <div class="reference-item" data-from="${ref.from}" data-to="${ref.to}" tabindex="0" role="button" aria-label="Use ${ref.from}">
            <span class="from">${ref.from}</span>
            <span class="to">= ${ref.to}</span>
        </div>
    `).join('');

    // Bind click and keyboard events
    elements.referenceGrid.querySelectorAll('.reference-item').forEach(item => {
        const applyReference = () => {
            const fromStr = item.dataset.from;
            const match = fromStr.match(/^(-?[\d.]+)\s*(.+)$/);
            if (match) {
                elements.fromValue.value = match[1];
                const unitKey = findUnitKey(match[2].trim());
                if (unitKey) {
                    elements.fromUnit.value = unitKey;
                }
                convert();
            }
        };

        item.addEventListener('click', applyReference);

        // Keyboard activation
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                applyReference();
            }
        });
    });
}

function findUnitKey(unitStr) {
    const data = unitData[currentCategory];
    const keys = Object.keys(data.units);

    // An exact key match must win before any name matching: several unit
    // names contain other units' keys as substrings ("Metric Tons" contains
    // "ton", "Pascal-seconds" contains "P").
    const exact = keys.find(key => key === unitStr);
    if (exact) {
        return exact;
    }

    const lower = unitStr.toLowerCase();

    // Next prefer a parenthesized abbreviation in the display name, e.g.
    // "eq/L (N)" for "N"; a bare substring pass would hit "nmol/L" first.
    const abbrev = keys.find(key => data.units[key].name.toLowerCase().includes(`(${lower})`));
    if (abbrev) {
        return abbrev;
    }

    return keys.find(key => data.units[key].name.toLowerCase().includes(lower)) || null;
}

// Pure conversion core (no DOM). Returns a Number; throws on an unknown
// category/unit or a missing conversion factor. Exposed on window.UnitConverter
// for automated tests (tests/smoke/simple-unit-converter.spec.cjs).
function convertValue(category, value, fromUnit, toUnit) {
    const data = unitData[category];
    if (!data) {
        throw new Error(`Unknown category: ${category}`);
    }
    if (!data.units[fromUnit]) {
        throw new Error(`Unknown unit: ${fromUnit}`);
    }
    if (!data.units[toUnit]) {
        throw new Error(`Unknown unit: ${toUnit}`);
    }
    if (typeof value !== 'number' || isNaN(value)) {
        throw new Error('Invalid input value');
    }

    if (data.special && category === 'temperature') {
        return convertTemperature(value, fromUnit, toUnit);
    }

    const fromFactor = data.units[fromUnit].factor;
    const toFactor = data.units[toUnit].factor;
    if (typeof fromFactor !== 'number' || typeof toFactor !== 'number') {
        throw new Error(`Invalid conversion factor for ${fromUnit} or ${toUnit}`);
    }

    return (value * fromFactor) / toFactor;
}

function convert() {
    // Clear any previous error state
    clearError();

    const data = unitData[currentCategory];
    const fromVal = parseFloat(elements.fromValue.value);
    const fromUnit = elements.fromUnit.value;
    const toUnit = elements.toUnit.value;

    // Handle empty input - clear results and wait for valid input
    if (elements.fromValue.value.trim() === '') {
        clearResults();
        return;
    }

    // Validate input value
    if (isNaN(fromVal)) {
        showError('Invalid input value');
        return;
    }

    const inputValue = fromVal;

    // Validate units exist
    if (!data.units[fromUnit]) {
        showError(`Unknown unit: ${fromUnit}`);
        return;
    }
    if (!data.units[toUnit]) {
        showError(`Unknown unit: ${toUnit}`);
        return;
    }

    let result;

    try {
        result = convertValue(currentCategory, inputValue, fromUnit, toUnit);

        // Check result validity
        if (isNaN(result)) {
            showError('Conversion resulted in NaN');
            return;
        }

        if (!isFinite(result)) {
            showError('Conversion resulted in infinite value');
            return;
        }

        lastRawResult = result;

        // Format result
        const formattedResult = formatNumber(result);
        elements.toValue.value = formattedResult;

        // Update display
        const fromFormatted = formatNumber(inputValue);
        elements.resultValue.textContent = `${fromFormatted} ${fromUnit} = ${formattedResult} ${toUnit}`;

        // Formula
        if (data.special && currentCategory === 'temperature') {
            elements.resultFormula.textContent = getTemperatureFormula(fromUnit, toUnit);
        } else {
            const conversionFactor = data.units[fromUnit].factor / data.units[toUnit].factor;
            elements.resultFormula.textContent = `${fromFormatted} × ${formatNumber(conversionFactor)} = ${formattedResult}`;
        }

        updateDefinitionNote(fromUnit, toUnit, inputValue);

    } catch (e) {
        showError(`Conversion error: ${e.message}`);
    }
}

// Which calorie/BTU definition a unit's factor is built on. The factors
// deliberately follow the established convention for each unit, and those
// differ across (and within) categories: energy and specific-heat calories
// are thermochemical, power calories and kcal/(hr·m·°C) are International
// Table, and every BTU-derived unit (including therms and tons of
// refrigeration) is IT.
function definitionNoteForUnit(category, unit) {
    if (unit.includes('BTU') || unit.includes('therm') || unit === 'ton_ref') {
        return 'BTU is International Table (1 BTU = 1055.05585262 J).';
    }
    if (unit.includes('cal')) {
        const isIT = category === 'power' ||
            (category === 'thermalConductivity' && unit.startsWith('kcal'));
        return isIT
            ? 'cal is International Table (1 cal = 4.1868 J).'
            : 'cal is thermochemical (1 cal = 4.184 J).';
    }
    return '';
}

function updateDefinitionNote(fromUnit, toUnit, inputValue) {
    if (!elements.resultNote) {
        return;
    }

    const notes = [];
    const fromNote = definitionNoteForUnit(currentCategory, fromUnit);
    const toNote = definitionNoteForUnit(currentCategory, toUnit);
    if (fromNote) {
        notes.push(fromNote);
    }
    if (toNote && toNote !== fromNote) {
        notes.push(toNote);
    }

    if (currentCategory === 'pressure' && (fromUnit === 'mmHg' || toUnit === 'mmHg')) {
        notes.push('Using conventional mmHg (13595.1 kg/m³), not Torr.');
    }

    if (currentCategory === 'temperature') {
        const kelvin = convertTemperature(inputValue, fromUnit, 'K');
        if (isFinite(kelvin) && kelvin < 0) {
            notes.push('Below absolute zero (0 K); not physically reachable.');
        }
    }

    if (notes.length > 0) {
        elements.resultNote.textContent = 'Note: ' + notes.join(' ');
        elements.resultNote.style.display = 'block';
    } else {
        elements.resultNote.style.display = 'none';
    }
}

function showError(message) {
    lastRawResult = null;
    elements.toValue.value = '';
    elements.resultValue.textContent = 'Error';
    elements.resultFormula.textContent = message;
    elements.resultValue.style.color = 'var(--accent-error)';
    if (elements.resultNote) {
        elements.resultNote.style.display = 'none';
    }
}

function clearError() {
    elements.resultValue.style.color = '';
}

function clearResults() {
    lastRawResult = null;
    elements.toValue.value = '';
    elements.resultValue.textContent = '';
    elements.resultFormula.textContent = '';
    if (elements.resultNote) {
        elements.resultNote.style.display = 'none';
    }
}

async function handleCopyResult() {
    const resultText = elements.resultValue.textContent || '';

    if (!resultText) {
        return; // Nothing to copy
    }

    const copyText = elements.copyBtn?.querySelector('.copy-text');

    // Use the shared Clipboard utility with the text span as feedback element
    const success = await window.ToolsHub?.Clipboard?.copy(resultText, copyText);

    // Fallback if shared utility not available
    if (!success && elements.copyBtn && copyText) {
        const originalText = copyText.textContent;
        copyText.textContent = 'Copied!';
        elements.copyBtn.classList.add('copy-success');

        setTimeout(() => {
            copyText.textContent = originalText;
            elements.copyBtn.classList.remove('copy-success');
        }, 1500);
    }
}

function convertTemperature(value, from, to) {
    // Validate input
    if (typeof value !== 'number' || isNaN(value)) {
        return NaN;
    }

    // Convert to Kelvin first
    let kelvin;
    switch (from) {
        case '°C': kelvin = value + 273.15; break;
        case '°F': kelvin = (value + 459.67) * 5/9; break;
        case 'K': kelvin = value; break;
        case '°R': kelvin = value * 5/9; break;
        default:
            return NaN; // Unknown unit
    }

    // Check for overflow during conversion
    if (!isFinite(kelvin)) {
        return NaN;
    }

    // Convert from Kelvin to target
    switch (to) {
        case '°C': return kelvin - 273.15;
        case '°F': return kelvin * 9/5 - 459.67;
        case 'K': return kelvin;
        case '°R': return kelvin * 9/5;
        default:
            return NaN; // Unknown unit
    }
}

function getTemperatureFormula(from, to) {
    const formulas = {
        '°C-°F': '°F = °C × 9/5 + 32',
        '°F-°C': '°C = (°F - 32) × 5/9',
        '°C-K': 'K = °C + 273.15',
        'K-°C': '°C = K - 273.15',
        '°F-K': 'K = (°F + 459.67) × 5/9',
        'K-°F': '°F = K × 9/5 - 459.67',
        '°C-°R': '°R = (°C + 273.15) × 9/5',
        '°R-°C': '°C = °R × 5/9 - 273.15',
        '°F-°R': '°R = °F + 459.67',
        '°R-°F': '°F = °R - 459.67',
        'K-°R': '°R = K × 9/5',
        '°R-K': 'K = °R × 5/9'
    };
    return formulas[`${from}-${to}`] || 'Direct conversion';
}

function swapUnits() {
    const tempUnit = elements.fromUnit.value;
    elements.fromUnit.value = elements.toUnit.value;
    elements.toUnit.value = tempUnit;

    // Feed the result back as the new input at 15 significant digits: enough
    // that drift can never reach the 10-digit display even across repeated
    // swaps, while exact decimals stay clean ("0.3048", not the raw double
    // "0.30479999999999996" that 12*0.0254 produces).
    if (lastRawResult !== null && isFinite(lastRawResult)) {
        elements.fromValue.value = String(parseFloat(lastRawResult.toPrecision(15)));
    }

    convert();
}

function formatNumber(num) {
    // Handle non-numeric input gracefully
    if (typeof num !== 'number' || isNaN(num)) {
        return '0';
    }

    // Handle infinity
    if (!isFinite(num)) {
        return num > 0 ? '∞' : '-∞';
    }

    if (num === 0) return '0';
    if (Math.abs(num) < 0.0001 || Math.abs(num) >= 1e10) {
        return num.toExponential(6);
    }
    // Smart precision
    const str = num.toPrecision(10);
    return parseFloat(str).toString();
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Pure conversion surface exposed for automated tests
// (tests/smoke/simple-unit-converter.spec.cjs).
window.UnitConverter = {
    unitData,
    convert: convertValue,
    convertTemperature,
    formatNumber
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM is already ready
    init();
}
})();
