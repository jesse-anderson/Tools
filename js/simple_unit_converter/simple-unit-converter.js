// ============================================
// Unit Converter
// ============================================

(function() {
    'use strict';

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
            'in': { name: 'Inches', factor: 0.0254 },
            'ft': { name: 'Feet', factor: 0.3048 },
            'yd': { name: 'Yards', factor: 0.9144 },
            'mi': { name: 'Miles', factor: 1609.344 },
            'nmi': { name: 'Nautical Miles', factor: 1852 },
            'mil': { name: 'Mils (thou)', factor: 0.0000254 },
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
            'lb': { name: 'Pounds', factor: 0.45359237 },
            'oz': { name: 'Ounces', factor: 0.028349523125 },
            'ton': { name: 'Short Tons (US)', factor: 907.18474 },
            'ton_uk': { name: 'Long Tons (UK)', factor: 1016.0469088 },
            'st': { name: 'Stones', factor: 6.35029318 },
            'gr': { name: 'Grains', factor: 0.00006479891 },
            'slug': { name: 'Slugs', factor: 14.593903 }
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
            'mL': { name: 'Milliliters', factor: 0.001 },
            'μL': { name: 'Microliters', factor: 1e-6 },
            'm³': { name: 'Cubic Meters', factor: 1000 },
            'cm³': { name: 'Cubic Centimeters', factor: 0.001 },
            'mm³': { name: 'Cubic Millimeters', factor: 1e-6 },
            'gal': { name: 'US Gallons', factor: 3.785411784 },
            'gal_uk': { name: 'UK Gallons', factor: 4.54609 },
            'qt': { name: 'US Quarts', factor: 0.946352946 },
            'pt': { name: 'US Pints', factor: 0.473176473 },
            'cup': { name: 'US Cups', factor: 0.2365882365 },
            'fl_oz': { name: 'US Fluid Ounces', factor: 0.0295735295625 },
            'tbsp': { name: 'Tablespoons', factor: 0.01478676478125 },
            'tsp': { name: 'Teaspoons', factor: 0.00492892159375 },
            'ft³': { name: 'Cubic Feet', factor: 28.316846592 },
            'in³': { name: 'Cubic Inches', factor: 0.016387064 },
            'yd³': { name: 'Cubic Yards', factor: 764.554857984 },
            'bbl': { name: 'Oil Barrels (US)', factor: 158.987294928 },
            'bbl_uk': { name: 'UK Barrels', factor: 163.65924 }
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
            'kPa': { name: 'Kilopascals', factor: 1000 },
            'MPa': { name: 'Megapascals', factor: 1e6 },
            'GPa': { name: 'Gigapascals', factor: 1e9 },
            'bar': { name: 'Bar', factor: 100000 },
            'mbar': { name: 'Millibar', factor: 100 },
            'atm': { name: 'Atmospheres', factor: 101325 },
            'psi': { name: 'PSI', factor: 6894.757293168 },
            'ksi': { name: 'KSI', factor: 6894757.293168 },
            'psf': { name: 'PSF', factor: 47.88025898 },
            'mmHg': { name: 'mmHg (Torr)', factor: 133.322387415 },
            'inHg': { name: 'Inches Hg', factor: 3386.389 },
            'mmH₂O': { name: 'mm Water', factor: 9.80665 },
            'inH₂O': { name: 'Inches Water', factor: 249.08891 },
            'ftH₂O': { name: 'Feet Water', factor: 2989.06692 },
            'kg/cm²': { name: 'kg/cm²', factor: 98066.5 },
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
            'cal': { name: 'Calories', factor: 4.184 },
            'kcal': { name: 'Kilocalories', factor: 4184 },
            'BTU': { name: 'BTU', factor: 1055.05585262 },
            'MMBTU': { name: 'MMBTU', factor: 1055055852.62 },
            'therm': { name: 'Therms', factor: 105505585.262 },
            'Wh': { name: 'Watt-hours', factor: 3600 },
            'kWh': { name: 'Kilowatt-hours', factor: 3600000 },
            'MWh': { name: 'Megawatt-hours', factor: 3.6e9 },
            'eV': { name: 'Electron Volts', factor: 1.602176634e-19 },
            'ft·lbf': { name: 'Foot-pounds', factor: 1.3558179483 },
            'erg': { name: 'Ergs', factor: 1e-7 },
            'hp·h': { name: 'Horsepower-hours', factor: 2684519.5377 }
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
            'hp': { name: 'Horsepower (mech)', factor: 745.69987158 },
            'hp_m': { name: 'Horsepower (metric)', factor: 735.49875 },
            'hp_e': { name: 'Horsepower (elec)', factor: 746 },
            'BTU/hr': { name: 'BTU/hour', factor: 0.29307107 },
            'BTU/min': { name: 'BTU/minute', factor: 17.5842642 },
            'BTU/s': { name: 'BTU/second', factor: 1055.05585 },
            'ton_ref': { name: 'Tons Refrig.', factor: 3516.8528 },
            'cal/s': { name: 'Calories/sec', factor: 4.184 },
            'kcal/hr': { name: 'kcal/hour', factor: 1.163 },
            'ft·lbf/s': { name: 'ft·lbf/sec', factor: 1.3558179483 },
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
            'gpm': { name: 'US gal/min', factor: 0.0630901964 },
            'gph': { name: 'US gal/hour', factor: 0.00105150327 },
            'gpd': { name: 'US gal/day', factor: 0.0000438126364 },
            'cfm': { name: 'ft³/min (CFM)', factor: 0.471947443 },
            'cfs': { name: 'ft³/sec (CFS)', factor: 28.316846592 },
            'cfh': { name: 'ft³/hour', factor: 0.00786579072 },
            'bbl/day': { name: 'Barrels/day', factor: 0.00184012912 },
            'MGD': { name: 'Million gal/day', factor: 43.8126364 },
            'SCFM': { name: 'Std ft³/min', factor: 0.471947443 }
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
            'lb/s': { name: 'lb/sec', factor: 0.45359237 },
            'lb/min': { name: 'lb/min', factor: 0.45359237/60 },
            'lb/hr': { name: 'lb/hour', factor: 0.45359237/3600 },
            'ton/hr': { name: 'Short ton/hr', factor: 907.18474/3600 },
            'ton/day': { name: 'Short ton/day', factor: 907.18474/86400 }
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
            'lb/ft³': { name: 'lb/ft³', factor: 16.01846337 },
            'lb/in³': { name: 'lb/in³', factor: 27679.9047 },
            'lb/gal': { name: 'lb/US gal', factor: 119.826427 },
            'lb/gal_uk': { name: 'lb/UK gal', factor: 99.776373 },
            'slug/ft³': { name: 'slug/ft³', factor: 515.378819 },
            'oz/in³': { name: 'oz/in³', factor: 1729.99405 },
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
            'lb/(ft·s)': { name: 'lb/(ft·s)', factor: 1.48816394 },
            'lb/(ft·hr)': { name: 'lb/(ft·hr)', factor: 0.000413378872 },
            'lbf·s/ft²': { name: 'lbf·s/ft²', factor: 47.8802589 },
            'lbf·s/in²': { name: 'Reyn', factor: 6894.75729 },
            'slug/(ft·s)': { name: 'slug/(ft·s)', factor: 47.8802589 }
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
            'ft²/s': { name: 'ft²/s', factor: 0.09290304 },
            'ft²/hr': { name: 'ft²/hr', factor: 0.09290304/3600 },
            'in²/s': { name: 'in²/s', factor: 0.00064516 }
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
            'kgf': { name: 'Kilogram-force', factor: 9.80665 },
            'gf': { name: 'Gram-force', factor: 0.00980665 },
            'lbf': { name: 'Pound-force', factor: 4.4482216152605 },
            'kip': { name: 'Kips', factor: 4448.2216152605 },
            'ozf': { name: 'Ounce-force', factor: 0.2780138509 },
            'tonf': { name: 'Short ton-force', factor: 8896.443230521 },
            'tonf_uk': { name: 'Long ton-force', factor: 9964.01641818 },
            'pdl': { name: 'Poundals', factor: 0.138254954376 }
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
            'ft²': { name: 'Square Feet', factor: 0.09290304 },
            'in²': { name: 'Square Inches', factor: 0.00064516 },
            'yd²': { name: 'Square Yards', factor: 0.83612736 },
            'mi²': { name: 'Square Miles', factor: 2589988.110336 },
            'acre': { name: 'Acres', factor: 4046.8564224 },
            'circ_mil': { name: 'Circular Mils', factor: 5.067074790975e-10 }
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
            'mph': { name: 'Miles/hour', factor: 0.44704 },
            'fps': { name: 'Feet/sec', factor: 0.3048 },
            'fpm': { name: 'Feet/min', factor: 0.00508 },
            'fph': { name: 'Feet/hour', factor: 0.3048/3600 },
            'ips': { name: 'Inches/sec', factor: 0.0254 },
            'kn': { name: 'Knots', factor: 0.514444444 },
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
            'kgf·m': { name: 'kgf-meters', factor: 9.80665 },
            'kgf·cm': { name: 'kgf-cm', factor: 0.0980665 },
            'gf·cm': { name: 'gf-cm', factor: 0.0000980665 },
            'lbf·ft': { name: 'Pound-feet', factor: 1.3558179483 },
            'lbf·in': { name: 'Pound-inches', factor: 0.1129848290 },
            'ozf·in': { name: 'Ounce-inches', factor: 0.00706155181 },
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
            'BTU/(hr·ft·°F)': { name: 'BTU/(hr·ft·°F)', factor: 1.730734666 },
            'BTU·in/(hr·ft²·°F)': { name: 'BTU·in/(hr·ft²·°F)', factor: 0.144227889 },
            'cal/(s·cm·°C)': { name: 'cal/(s·cm·°C)', factor: 418.4 },
            'kcal/(hr·m·°C)': { name: 'kcal/(hr·m·°C)', factor: 1.163 }
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
            'cal/(g·°C)': { name: 'cal/(g·°C)', factor: 4184 },
            'kcal/(kg·°C)': { name: 'kcal/(kg·°C)', factor: 4184 },
            'BTU/(lb·°F)': { name: 'BTU/(lb·°F)', factor: 4186.8 },
            'BTU/(lb·°R)': { name: 'BTU/(lb·°R)', factor: 4186.8 }
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
    }
};

// ============================================
// Converter Logic
// ============================================
let currentCategory = 'length';

const elements = {
    categoryList: document.getElementById('uc-categoryList'),
    panelIcon: document.getElementById('uc-panelIcon'),
    panelTitle: document.getElementById('uc-panelTitle'),
    fromValue: document.getElementById('uc-fromValue'),
    fromUnit: document.getElementById('uc-fromUnit'),
    toValue: document.getElementById('uc-toValue'),
    toUnit: document.getElementById('uc-toUnit'),
    resultValue: document.getElementById('uc-resultValue'),
    resultFormula: document.getElementById('uc-resultFormula'),
    referenceGrid: document.getElementById('uc-referenceGrid'),
    swapBtn: document.getElementById('uc-swapBtn'),
    copyBtn: document.getElementById('uc-copyBtn')
};

// Initialize
function init() {
    bindCategoryEvents();
    bindInputEvents();
    loadCategory(currentCategory);
}

function bindCategoryEvents() {
    const categoryItems = elements.categoryList.querySelectorAll('.category-item');

    // Handle category selection (both click and keyboard activation)
    function selectCategory(item) {
        const activeItem = document.querySelector('.category-item.active');
        if (activeItem) {
            activeItem.classList.remove('active');
            activeItem.setAttribute('aria-selected', 'false');
        }
        item.classList.add('active');
        item.setAttribute('aria-selected', 'true');
        item.focus();
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
                items[nextIndex].focus();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const prevIndex = (currentIndex - 1 + items.length) % items.length;
                items[prevIndex].focus();
            } else if (e.key === 'Home') {
                e.preventDefault();
                items[0].focus();
            } else if (e.key === 'End') {
                e.preventDefault();
                items[items.length - 1].focus();
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
    for (const key of Object.keys(data.units)) {
        if (key === unitStr || data.units[key].name.toLowerCase().includes(unitStr.toLowerCase())) {
            return key;
        }
    }
    return null;
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
        if (data.special && currentCategory === 'temperature') {
            result = convertTemperature(inputValue, fromUnit, toUnit);
        } else {
            // Standard conversion via base unit
            const fromFactor = data.units[fromUnit].factor;
            const toFactor = data.units[toUnit].factor;

            if (typeof fromFactor !== 'number' || typeof toFactor !== 'number') {
                showError(`Invalid conversion factor for ${fromUnit} or ${toUnit}`);
                return;
            }

            const baseValue = inputValue * fromFactor;

            // Check for overflow
            if (!isFinite(baseValue)) {
                showError('Value overflow: number too large');
                return;
            }

            result = baseValue / toFactor;
        }

        // Check result validity
        if (isNaN(result)) {
            showError('Conversion resulted in NaN');
            return;
        }

        if (!isFinite(result)) {
            showError('Conversion resulted in infinite value');
            return;
        }

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

        // Handle Definitions/Ambiguity
        const noteElement = document.getElementById('uc-resultNote');
        const ambiguousUnits = ['cal', 'kcal', 'BTU', 'MMBTU', 'therm'];

        // Check if either unit is in our "ambiguous" list
        const isAmbiguous = ambiguousUnits.some(u => fromUnit.includes(u) || toUnit.includes(u));

        if (isAmbiguous) {
            // Customize this logic based on which specific definition you are using per category
            let msg = "";
            if (currentCategory === 'energy' || currentCategory === 'specificHeat') {
                // code: Energy uses 4.184 (Thermochemical), but Power uses IT.
                // This detects if we are in the category using Thermochemical.
                msg = "Using Thermochemical definition (1 cal = 4.184 J).";
            } else if (currentCategory === 'power') {
                msg = "Using International Table definition (1 cal = 4.1868 J).";
            }

            if (msg) {
                noteElement.textContent = "Note: " + msg;
                noteElement.style.display = 'block';
            } else {
                noteElement.style.display = 'none';
            }
        } else if (currentCategory === 'pressure' && (fromUnit === 'mmHg' || toUnit === 'mmHg')) {
            //Add note for mmHg vs Torr want to be super precise
            noteElement.textContent = "Note: Using conventional mmHg (13595.1 kg/m³), not Torr.";
            noteElement.style.display = 'block';
        } else {
            noteElement.style.display = 'none';
        }

    } catch (e) {
        showError(`Conversion error: ${e.message}`);
    }
}

function showError(message) {
    elements.toValue.value = '';
    elements.resultValue.textContent = 'Error';
    elements.resultFormula.textContent = message;
    elements.resultValue.style.color = 'var(--accent-error)';
}

function clearError() {
    elements.resultValue.style.color = '';
}

function clearResults() {
    elements.toValue.value = '';
    elements.resultValue.textContent = '';
    elements.resultFormula.textContent = '';
    const noteElement = document.getElementById('uc-resultNote');
    if (noteElement) {
        noteElement.style.display = 'none';
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
    // Swap the units
    const tempUnit = elements.fromUnit.value;
    elements.fromUnit.value = elements.toUnit.value;
    elements.toUnit.value = tempUnit;

    // Swap the values - use the calculated result as the new input
    const result = elements.toValue.value;
    if (result) {
        elements.fromValue.value = result;
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

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM is already ready
        init();
    }
})();
