(function () {
    'use strict';

    // ========================================
    // MODAL CONTENT
    // ========================================
    const MODAL_CONTENTS = {
        directions: {
            title: 'How to Use This Tool',
            html: `
                <h3>Getting Started</h3>
                <p>The <strong>Psychrometric Calculator</strong> computes moist air properties essential for HVAC design, building science, and meteorology. Given any two independent properties, all other properties can be calculated.</p>

                <h3>Choosing Your Input Mode</h3>
                <table>
                    <tr><th>Mode</th><th>Use When You Have...</th><th>Common Application</th></tr>
                    <tr><td><strong>Tdb + Twb</strong></td><td>Sling psychrometer or aspirated psychrometer readings</td><td>Field measurements, HVAC commissioning</td></tr>
                    <tr><td><strong>Tdb + RH</strong></td><td>Thermostat with humidity sensor, weather data</td><td>Building automation, weather stations</td></tr>
                    <tr><td><strong>Tdb + Tdp</strong></td><td>Dew point sensor or meteorological forecast</td><td>Condensation risk assessment</td></tr>
                    <tr><td><strong>Tdb + W</strong></td><td>Humidity ratio from process calculation</td><td>Industrial drying, mixing air streams</td></tr>
                </table>

                <h3>Understanding the Results</h3>
                <ul>
                    <li><strong>Dry Bulb (Tdb):</strong> Actual air temperature measured by a standard thermometer</li>
                    <li><strong>Wet Bulb (Twb):</strong> Temperature indicated by a thermometer with a wetted wick; represents adiabatic saturation temperature</li>
                    <li><strong>Dew Point (Tdp):</strong> Temperature at which water vapor begins to condense; Tdp ≤ Twb ≤ Tdb always</li>
                    <li><strong>Relative Humidity (RH):</strong> Ratio of actual moisture to maximum possible at current Tdb; 100% = saturation</li>
                    <li><strong>Humidity Ratio (W):</strong> Mass of water vapor per mass of dry air; independent of temperature</li>
                    <li><strong>Enthalpy (h):</strong> Total energy content (sensible + latent) per kg of dry air</li>
                </ul>

                <h3>Pressure Setting</h3>
                <p>Default is <strong>101.325 kPa</strong> (standard atmospheric pressure at sea level). Adjust for altitude:</p>
                <ul>
                    <li>Denver (1600 m): ~83 kPa</li>
                    <li>Mexico City (2240 m): ~77 kPa</li>
                </ul>

                <div class="warning-box">
                    <strong> Important:</strong> At altitudes above 500m, pressure corrections significantly affect W and h calculations. Always verify your site pressure.
                </div>

                <h3>Quick Checks</h3>
                <ul>
                    <li><strong>Tdp ≤ Twb ≤ Tdb</strong> - violation indicates measurement error</li>
                    <li><strong>RH at Tdp = 100%</strong>  By definition of dew point</li>
                    <li><strong>Enthalpy increases</strong> with both Tdb and humidity</li>
                </ul>
            `
        },

        details: {
            title: 'Equations & Technical Details',
            html: `
                <h3>Calculation Engine: PsychroLib</h3>
                <p>This calculator uses <strong>PsychroLib v2.5.0</strong>, the open-source Python and JavaScript library implementing ASHRAE psychrometric equations. PsychroLib is the canonical implementation of:</p>
                <ul>
                    <li>ASHRAE Handbook - Fundamentals (2017) Chapter 1</li>
                    <li>All psychrometric property calculations</li>
                    <li>Both SI and IP unit systems</li>
                </ul>
                <p><a href="https://github.com/psychrometrics/psychrolib" target="_blank" rel="noopener">github.com/psychrometrics/psychrolib</a> - Licensed under MIT License</p>

                <h3>Psychrometric Properties Defined</h3>
                <table>
                    <tr><th>Symbol</th><th>Property</th><th>Physical Meaning</th><th>Typical Range</th></tr>
                    <tr><td><strong>Tdb</strong></td><td>Dry Bulb Temperature</td><td>Sensible temperature of air-vapor mixture</td><td>-10°C to 50°C</td></tr>
                    <tr><td><strong>Twb</strong></td><td>Wet Bulb Temperature</td><td>Temperature at adiabatic saturation</td><td>Tdp ≤ Twb ≤ Tdb</td></tr>
                    <tr><td><strong>Tdp</strong></td><td>Dew Point Temperature</td><td>Temperature where condensation begins</td><td>Tdp ≤ Tdb</td></tr>
                    <tr><td><strong>RH</strong></td><td>Relative Humidity</td><td>Actual vapor pressure / saturation pressure</td><td>0% to 100%</td></tr>
                    <tr><td><strong>W</strong></td><td>Humidity Ratio (Mixing Ratio)</td><td>kg water vapor per kg dry air</td><td>0 to 30 g/kg</td></tr>
                    <tr><td><strong>h</strong></td><td>Specific Enthalpy</td><td>Total energy (sensible + latent) per kg dry air</td><td>-10 to 150 kJ/kg</td></tr>
                    <tr><td><strong>v</strong></td><td>Specific Volume</td><td>Volume per kg of dry air</td><td>0.75 to 0.95 m³/kg</td></tr>
                </table>

                <h3>Key ASHRAE Equations (via PsychroLib)</h3>

                <p><strong>1. Saturation Vapor Pressure (ASHRAE Ch.1, Eq. 5 & 6):</strong>
                <div class="equation">Eq. 5 (water): ln(Pws) = C/T + D + E*T + F*T^2 + G*T^3 + H*ln(T)</div>
                <div class="equation">Eq. 6 (ice): ln(Pws) = C/T + D + E*T + F*T^2 + G*T^3 + H*T + I*ln(T)</div>
                <p>Valid for: Eq. 5 (water): 0°C to 200°C | Eq. 6 (ice): -100°C to 0°C</p>

                <p><strong>2. Humidity Ratio (Dalton's Law):</strong>
                <div class="equation">W = 0.621945 × Pw / (Pa - Pw)</div>

                <p><strong>3. Specific Enthalpy (ASHRAE Eq. 30):</strong>
                <div class="equation">h = 1.006 × Tdb + W × (2501 + 1.86 × Tdb)</div>

                <p><strong>4. Specific Volume (Ideal Gas Law):</strong>
                <div class="equation">v = Ra × T(K) × (1 + 1.6078 × W) / Pa</div>

                <p><strong>5. Wet Bulb Temperature:</strong>
                <div class="equation">Twb = GetTWetBulbFromHumRatio(Tdb, W, Pa)</div>
                <p>PsychroLib solves the ASHRAE wet-bulb humidity-ratio equation by bisection between dew point and dry bulb.</p>

                <h3>Constants Used</h3>
                <table>
                    <tr><th>Constant</th><th>Value</th><th>Unit</th><th>Description</th></tr>
                    <tr><td>MW_ratio</td><td>0.621945</td><td></td><td>Mw/Ma (18.015/28.965)</td></tr>
                    <tr><td>R_a</td><td>0.2871</td><td>kJ/(kg·K)</td><td>Dry air gas constant</td></tr>
                    <tr><td>cp_air</td><td>1.006</td><td>kJ/(kg·K)</td><td>Specific heat of dry air</td></tr>
                    <tr><td>cp_vapor</td><td>1.86</td><td>kJ/(kg·K)</td><td>Specific heat of water vapor</td></tr>
                    <tr><td>h_fg_0°C</td><td>2501</td><td>kJ/kg</td><td>Latent heat at 0°C</td></tr>
                </table>

                <h3>Unit Conversions</h3>
                <table>
                    <tr><th>Property</th><th>SI</th><th>IP (Imperial)</th><th>Conversion</th></tr>
                    <tr><td>Temperature</td><td>°C</td><td>°F</td><td>°F = °C × 9/5 + 32</td></tr>
                    <tr><td>Pressure</td><td>kPa</td><td>psi</td><td>psi = kPa × 0.145038</td></tr>
                    <tr><td>Humidity Ratio</td><td>g/kg or kg/kg</td><td>lb/lb</td><td>Same numeric value</td></tr>
                    <tr><td>Enthalpy</td><td>kJ/kg</td><td>Btu/lb</td><td>Btu/lb = kJ/kg × 0.429923</td></tr>
                    <tr><td>Specific Volume</td><td>m³/kg</td><td>ft³/lb</td><td>ft³/lb = m³/kg × 16.0185</td></tr>
                </table>
            `
        },

        assumptions: {
            title: 'Assumptions & Limitations',
            html: `
                <h3>Calculation Engine</h3>
                <p>This calculator uses <strong>PsychroLib v2.5.0</strong>, the authoritative open-source implementation of ASHRAE psychrometric equations. All calculations inherit PsychroLib's assumptions and limitations.</p>

                <h3>When Is This Calculator Valid?</h3>
                <p>The psychrometric equations are based on the ideal gas model with empirical corrections. Understanding these limits is critical for accurate results.</p>

                <h3>Physical Assumptions</h3>
                <table>
                    <tr><th>Assumption</th><th>What It Means</th><th>Limits</th></tr>
                    <tr><td><strong>Ideal gas behavior</strong></td><td>Air and water vapor follow PV = nRT</td><td>Breaks down above ~10 atm</td></tr>
                    <tr><td><strong>Dalton's Law</strong></td><td>Partial pressures sum to total pressure</td><td>Valid for typical HVAC conditions</td></tr>
                    <tr><td><strong>Air-water vapor mixture</strong></td><td>Only dry air + water vapor; no other gases</td><td>Contaminants not modeled</td></tr>
                    <tr><td><strong>No liquid water entrainment</strong></td><td>Fog or mist not carried in air stream</td><td>If RH=100% and cooling further, fog forms</td></tr>
                </table>

                <h3>Temperature Range</h3>
                <ul>
                    <li><strong>Equation 5 (water):</strong> 0°C to 200°C - saturation over liquid water</li>
                    <li><strong>Equation 6 (ice):</strong> -100°C to 0°C - saturation over ice</li>
                    <li><strong>Transition at 0°C:</strong> PsychroLib uses Eq. 5 above 0°C, Eq. 6 below 0°C</li>
                </ul>

                <div class="warning-box">
                    <strong>Sub-zero Dew Point:</strong> When Tdp < 0°C, saturation is over ICE not water. This affects the Pws calculation and results in slightly different humidity ratios than extrapolating liquid water equations.
                </div>

                <h3>Accuracy Expectations</h3>
                <p>Per PsychroLib documentation (based on ASHRAE validation):</p>
                <table>
                    <tr><th>Property</th><th>Expected Accuracy</th></tr>
                    <tr><td>Pws (saturation pressure)</td><td>0.1% within 0-100°C</td></tr>
                    <tr><td>W (humidity ratio)</td><td>0.5%</td></tr>
                    <tr><td>Twb (wet bulb)</td><td>0.1°C (PsychroLib solver)</td></tr>
                    <tr><td>h (enthalpy)</td><td>0.3 kJ/kg</td></tr>
                </table>

                <h3>Common Pitfalls</h3>
                <ul>
                    <li><strong>Altitude effects:</strong> At 1500m, pressure is ~84 kPa, which significantly affects W calculation</li>
                    <li><strong>Sensor errors:</strong> Cheap RH sensors can be ±5%, which propagates to all derived properties</li>
                    <li><strong>Wet bulb measurement:</strong> Sling psychrometer requires proper airspeed (>3 m/s) over wick</li>
                </ul>

                <h3>PsychroLib Notes</h3>
                <p>PsychroLib implements the 2017 ASHRAE Handbook - Fundamentals equations. The library is maintained by the ASHRAE psychrometrics community and validated against published ASHRAE data.</p>
            `
        },

        techref: {
            title: 'Technical References',
            html: `
                <h3>Calculation Engine</h3>
                <table>
                    <tr><th>Source</th><th>License</th><th>Link</th></tr>
                    <tr><td><strong>PsychroLib v2.5.0</strong><br>The ASHRAE Psychrometrics Library</td>
                    <td><a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener">MIT License</a><br>Free to use, modify, distribute</td>
                    <td><a href="https://github.com/psychrometrics/psychrolib" target="_blank" rel="noopener">github.com/psychrometrics/psychrolib</a></td></tr>
                </table>

                <h3>Primary Sources (via PsychroLib)</h3>
                <table>
                    <tr><th>Source</th><th>Relevance</th></tr>
                    <tr><td><strong>ASHRAE Handbook - Fundamentals</strong><br>2017, 2021 editions<br>Chapter 1: Psychrometrics</td><td>Authoritative source for all equations implemented in PsychroLib. Eqs. 5, 6 for Pws; Eq. 30 for h; Eq. 37 for Twb.</td></tr>
                    <tr><td><strong>W. P. Jones</strong><br>Air Conditioning Engineering, 2012</td><td>Practical applications and worked examples.</td></tr>
                </table>

                <h3>Key PsychroLib Functions Used</h3>
                <table>
                    <tr><th>Function</th><th>Purpose</th></tr>
                    <tr><td>GetSatVapPres()</td><td>Saturation vapor pressure (ASHRAE Eq. 5/6)</td></tr>
                    <tr><td>GetHumRatioFromVapPres()</td><td>Convert vapor pressure to humidity ratio</td></tr>
                    <tr><td>GetTDewPointFromVapPres()</td><td>Dew point from vapor pressure (Newton-Raphson)</td></tr>
                    <tr><td>GetTWetBulbFromHumRatio()</td><td>Wet bulb from humidity ratio (bisection)</td></tr>
                    <tr><td>GetMoistAirEnthalpy()</td><td>Specific enthalpy (ASHRAE Eq. 30)</td></tr>
                    <tr><td>GetMoistAirVolume()</td><td>Specific volume (ideal gas law)</td></tr>
                    <tr><td>CalcPsychrometricsFromRelHum()</td><td>Full properties from Tdb + RH</td></tr>
                    <tr><td>CalcPsychrometricsFromTWetBulb()</td><td>Full properties from Tdb + Twb</td></tr>
                    <tr><td>CalcPsychrometricsFromTDewPoint()</td><td>Full properties from Tdb + Tdp</td></tr>
                </table>

                <h3>Constants Used (from PsychroLib)</h3>
                <table>
                    <tr><th>Constant</th><th>Value</th><th>Unit</th><th>Source</th></tr>
                    <tr><td>R_a (dry air gas constant)</td><td>0.2871</td><td>kJ/(kg·K)</td><td>CODATA 2018</td></tr>
                    <tr><td>MW_ratio</td><td>0.621945</td><td></td><td>IUPAC atomic weights</td></tr>
                    <tr><td>cp_air</td><td>1.006</td><td>kJ/(kg·K)</td><td>ASHRAE Ch.1</td></tr>
                    <tr><td>cp_vapor</td><td>1.86</td><td>kJ/(kg·K)</td><td>ASHRAE Ch.1</td></tr>
                    <tr><td>h_fg_0°C</td><td>2501</td><td>kJ/kg</td><td>IAPWS-95</td></tr>
                </table>

                <h3>Validation Data (PsychroLib v2.5.0)</h3>
                <table>
                    <tr><th>Tdb (°C)</th><th>RH (%)</th><th>Twb (°C)</th><th>Tdp (°C)</th><th>W (g/kg)</th><th>h (kJ/kg)</th></tr>
                    <tr><td>25</td><td>50</td><td>17.89</td><td>13.86</td><td>9.88</td><td>50.32</td></tr>
                    <tr><td>30</td><td>70</td><td>25.50</td><td>23.93</td><td>18.80</td><td>78.24</td></tr>
                    <tr><td>20</td><td>30</td><td>10.85</td><td>1.91</td><td>4.34</td><td>31.13</td></tr>
                </table>
                <p style="font-size: 0.8125rem; color: var(--text-muted);">All values computed using PsychroLib's SI mode, converted to display units.</p>
            `
        },

        examples: {
            title: 'Worked Examples',
            html: `
                <h3>Example 1: Comfort Room Conditions</h3>
                <p><strong>Given:</strong> Tdb = 25°C, RH = 50%, Pa = 101.325 kPa (sea level)</p>
                <p style="font-size: 0.8125rem; color: var(--text-muted);">Calculated using PsychroLib v2.5.0</p>

                <h4>Step 1: Calculate Saturation Pressure at Tdb</h4>
                <p>Using ASHRAE Eq. 5: ln(Pws) = C/T + D + E*T + F*T^2 + G*T^3 + H*ln(T)</p>
                <p>At Tdb = 25°C (298.15 K):</p>
                <div class="equation">Pws = 3.169 kPa</div>

                <h4>Step 2: Calculate Partial Vapor Pressure</h4>
                <div class="equation">Pw = RH/100 × Pws = 0.50 × 3.169 = 1.585 kPa</div>

                <h4>Step 3: Calculate Humidity Ratio</h4>
                <div class="equation">W = 0.621945 × Pw / (Pa - Pw) = 0.621945 × 1.585 / (101.325 - 1.585)</div>
                <div class="equation">W = 0.00988 kg/kg = 9.88 g/kg</div>

                <h4>Step 4: Calculate Dew Point</h4>
                <p>Solve Pws(Tdp) = Pw using Newton-Raphson:</p>
                <div class="equation">Tdp = 13.86°C</div>

                <h4>Step 5: Calculate Enthalpy (ASHRAE Eq. 30)</h4>
                <div class="equation">h = 1.006 × Tdb + W × (2501 + 1.86 × Tdb)</div>
                <div class="equation">h = 1.006 × 25 + 0.00988 × (2501 + 1.86 × 25)</div>
                <div class="equation">h = 25.15 + 0.00988 × 2547.5 = 25.15 + 25.17 = 50.32 kJ/kg</div>

                <h4>Step 6: Calculate Wet Bulb (PsychroLib Solver)</h4>
                <p>PsychroLib solves GetTWetBulbFromHumRatio(Tdb, W, Pa) using the ASHRAE wet-bulb humidity-ratio relationship:</p>
                <div class="equation">Twb = 17.89°C</div>

                <h4>Results Summary</h4>
                <table>
                    <tr><th>Property</th><th>Value</th></tr>
                    <tr><td>Tdb</td><td>25.00°C</td></tr>
                    <tr><td>Twb</td><td>17.89°C</td></tr>
                    <tr><td>Tdp</td><td>13.86°C</td></tr>
                    <tr><td>RH</td><td>50.0%</td></tr>
                    <tr><td>W</td><td>9.88 g/kg</td></tr>
                    <tr><td>h</td><td>50.32 kJ/kg</td></tr>
                    <tr><td>v</td><td>0.858 m³/kg</td></tr>
                </table>

                <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 24px 0;">

                <h3>Example 2: Winter Outdoor Air</h3>
                <p><strong>Given:</strong> Tdb = 5°C, RH = 80%, Pa = 101.325 kPa</p>
                <p style="font-size: 0.8125rem; color: var(--text-muted);">Calculated using PsychroLib v2.5.0</p>

                <h4>Step 1: Saturation Pressure at 5°C</h4>
                <div class="equation">Pws(5°C) = 0.873 kPa</div>

                <h4>Step 2: Partial Vapor Pressure</h4>
                <div class="equation">Pw = 0.80 × 0.873 = 0.698 kPa</div>

                <h4>Step 3: Humidity Ratio</h4>
                <div class="equation">W = 0.621945 × 0.698 / (101.325 - 0.698) = 0.00430 kg/kg = 4.30 g/kg</div>

                <h4>Step 4: Dew Point</h4>
                <div class="equation">Tdp = 1.62°C</div>

                <h4>Step 5: Enthalpy</h4>
                <div class="equation">h = 1.006 × 5 + 0.00430 × (2501 + 1.86 × 5) = 5.03 + 10.82 = 15.85 kJ/kg</div>

                <h4>Step 6: Wet Bulb</h4>
                <div class="equation">Twb = 4.23°C</div>

                <h4>Results Summary</h4>
                <table>
                    <tr><th>Property</th><th>Value</th></tr>
                    <tr><td>Tdb</td><td>5.00°C</td></tr>
                    <tr><td>Twb</td><td>4.23°C</td></tr>
                    <tr><td>Tdp</td><td>1.62°C</td></tr>
                    <tr><td>RH</td><td>80.0%</td></tr>
                    <tr><td>W</td><td>4.30 g/kg</td></tr>
                    <tr><td>h</td><td>15.85 kJ/kg</td></tr>
                    <tr><td>v</td><td>0.793 m³/kg</td></tr>
                </table>

                <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 24px 0;">

                <h3>Example 3: High Humidity (Tropical)</h3>
                <p><strong>Given:</strong> Tdb = 32°C, RH = 85%, Pa = 101.325 kPa</p>
                <p style="font-size: 0.8125rem; color: var(--text-muted);">Calculated using PsychroLib v2.5.0</p>

                <h4>Step 1: Saturation Pressure at 32°C</h4>
                <div class="equation">Pws(32°C) = 4.756 kPa</div>

                <h4>Step 2: Partial Vapor Pressure</h4>
                <div class="equation">Pw = 0.85 × 4.756 = 4.043 kPa</div>

                <h4>Step 3: Humidity Ratio</h4>
                <div class="equation">W = 0.621945 × 4.043 / (101.325 - 4.043) = 0.0259 kg/kg = 25.9 g/kg</div>

                <h4>Step 4: Dew Point</h4>
                <div class="equation">Tdp = 29.23°C</div>

                <h4>Step 5: Enthalpy</h4>
                <div class="equation">h = 1.006 × 32 + 0.0259 × (2501 + 1.86 × 32) = 32.19 + 67.15 = 99.34 kJ/kg</div>

                <h4>Step 6: Wet Bulb</h4>
                <div class="equation">Twb = 30.12°C</div>

                <h4>Results Summary</h4>
                <table>
                    <tr><th>Property</th><th>Value</th></tr>
                    <tr><td>Tdb</td><td>32.00°C</td></tr>
                    <tr><td>Twb</td><td>30.12°C</td></tr>
                    <tr><td>Tdp</td><td>29.23°C</td></tr>
                    <tr><td>RH</td><td>85.0%</td></tr>
                    <tr><td>W</td><td>25.9 g/kg</td></tr>
                    <tr><td>h</td><td>99.34 kJ/kg</td></tr>
                    <tr><td>v</td><td>0.913 m³/kg</td></tr>
                </table>

                <div class="warning-box">
                    <strong>Note:</strong> The narrow spread between Tdb (32°C), Twb (30.1°C), and Tdp (29.2°C) indicates very humid air. Air conditioning in such conditions requires significant latent cooling.
                </div>
            `
        },

        about: {
            title: 'About This Tool',
            html: `
                <h3>Psychrometric Calculator</h3>
                <p><strong>Version:</strong> 1.1.0</p>
                <p><strong>Category:</strong> HVAC / Building Science / Engineering Calculators</p>

                <h3>Purpose</h3>
                <p>This calculator was created to fill a gap in freely available, accurate psychrometric tools. Most online psychrometric calculators either:</p>
                <ul>
                    <li>Use outdated equations (pre-2001 ASHRAE)</li>
                    <li>Lack proper documentation of assumptions</li>
                    <li>Have limited input modes</li>
                    <li>Don't show calculation steps</li>
                </ul>

                <h3>Features</h3>
                <ul>
                    <li><strong>4 input modes</strong>  Choose any two independent properties</li>
                    <li><strong>10+ output properties</strong>  Complete psychrometric state</li>
                    <li><strong>Interactive chart</strong>  Visual representation on psychrometric diagram</li>
                    <li><strong>Step-by-step calculations</strong> - full transparency of methods</li>
                    <li><strong>Altitude correction</strong>  Adjustable atmospheric pressure</li>
                </ul>

                <h3>Calculation Engine</h3>
                <p>This calculator uses <strong>PsychroLib v2.5.0</strong>, the authoritative open-source implementation of ASHRAE psychrometric equations. PsychroLib is maintained by the ASHRAE psychrometrics community and implements all equations from the 2017 ASHRAE Handbook - Fundamentals, Chapter 1.</p>
                <ul>
                    <li><a href="https://github.com/psychrometrics/psychrolib" target="_blank" rel="noopener">github.com/psychrometrics/psychrolib</a></li>
                    <li>License: MIT (free to use, modify, distribute)</li>
                    <li>Validated against published ASHRAE data</li>
                </ul>

                <h3>Implementation Notes</h3>
                <ul>
                    <li>PsychroLib for all ASHRAE equation calculations</li>
                    <li>Runs entirely in the browser (no server calls)</li>
                    <li>Responsive design for mobile and desktop</li>
                    <li>Custom wrapper for unit conversions (kPa  Pa, kJ/kg  J/kg)</li>
                </ul>

                <h3>License</h3>
                <p>GPL-3.0 - Free to use, modify, and distribute.</p>

                <h3>Third-Party Licenses & Attribution</h3>
                <p>This tool incorporates the following third-party resources:</p>
                <table>
                    <tr><th>Resource</th><th>License</th><th>Source</th></tr>
                    <tr>
                        <td><strong>PsychroLib v2.5.0</strong><br>ASHRAE Psychrometrics Library</td>
                        <td><a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener">MIT License</a><br>Free to use, modify, distribute</td>
                        <td><a href="https://github.com/psychrometrics/psychrolib" target="_blank" rel="noopener">github.com/psychrometrics/psychrolib</a></td>
                    </tr>
                    <tr>
                        <td><strong>Google Fonts</strong><br> JetBrains Mono<br> Space Grotesk</td>
                        <td><a href="https://scripts.sil.org/OFL" target="_blank" rel="noopener">Open Font License (OFL) 1.1</a><br>Free to use, embed, and distribute</td>
                        <td><a href="https://fonts.google.com" target="_blank" rel="noopener">fonts.googleapis.com</a></td>
                    </tr>
                    <tr>
                        <td><strong>ASHRAE Equations</strong><br>Saturation pressure (Eq. 5/6),<br>Enthalpy (Eq. 30)</td>
                        <td>ASHRAE Handbook - Fundamentals<br>ASHRAE - used under fair use<br>for educational purposes</td>
                        <td><a href="https://www.ashrae.org" target="_blank" rel="noopener">ashrae.org</a></td>
                    </tr>
                </table>
                <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 8px;">
                    This tool is not affiliated with, endorsed by, or sponsored by ASHRAE, Google, PsychroLib authors, or any font foundry.
                    All trademarks are property of their respective owners.
                </p>

                <div class="warning-box">
                    <h3>Disclaimer & Limitation of Liability</h3>
                    <p><strong>NO WARRANTY.</strong> This tool is provided "AS IS" without warranty of any kind, express or implied. The authors assume NO LIABILITY for errors, omissions, or damages resulting from use of this tool.</p>
                    <p><strong>USER ASSUMES ALL RISK.</strong> Psychrometric calculations involve complex thermodynamics. Input errors, sensor inaccuracies, or edge cases in the equations may produce incorrect results. This tool does not account for all real-world effects (aerosols, contaminants, non-ideal gas behavior at extreme pressures).</p>
                    <p><strong>VERIFY CRITICAL CALCULATIONS.</strong> For safety-critical systems, life-support applications, or any use where failure could cause harm, you MUST verify all results against ASHRAE Handbook charts, published tables, or validated engineering software.</p>
                    <p><strong>NOT PROFESSIONAL ADVICE.</strong> This tool does not constitute professional engineering advice. Consult a qualified professional engineer for HVAC design, building science applications, or any project requiring certified calculations.</p>
                </div>
            `
        }
    };

    function showModal(key) {
        const content = MODAL_CONTENTS[key];
        document.getElementById('modalTitle').textContent = content.title;
        document.getElementById('modalBody').innerHTML = content.html;
        document.getElementById('modalOverlay').classList.add('active');
    }

    function closeModal() {
        document.getElementById('modalOverlay').classList.remove('active');
    }

    // Exports
    window.showModal = showModal;
    window.closeModal = closeModal;
    const Psy = (window.Psy = window.Psy || {});
    Psy.showModal = showModal;
    Psy.closeModal = closeModal;
})();
