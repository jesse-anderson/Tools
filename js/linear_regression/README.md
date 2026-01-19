# linreg-core

[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue)](LICENSE-MIT)
[![Crates.io](https://img.shields.io/crates/v/linreg-core?color=orange)](https://crates.io/crates/linreg-core)
[![docs.rs](https://img.shields.io/badge/docs.rs-linreg__core-green)](https://docs.rs/linreg-core)

A lightweight, dependency-free Ordinary Least Squares (OLS) linear regression library written in Rust. Compiles to WebAssembly for browser use or runs as a native Rust crate.

**Key design principle:** All linear algebra and statistical distribution functions are implemented from scratch - no external math libraries required. This keeps binary sizes small and makes the crate highly portable.

## Features

- **OLS Regression:** Coefficients, standard errors, t-statistics, p-values, confidence intervals
- **Model Statistics:** R-squared, Adjusted R-squared, F-statistic, F-test p-value
- **Linearity Tests:**
  - Rainbow Test
  - Harvey-Collier Test
- **Heteroscedasticity Tests:**
  - Breusch-Pagan Test (studentized/Koenker variant)
  - White Test
- **Normality Tests:**
  - Jarque-Bera Test
  - Shapiro-Wilk Test (Royston's algorithm, n <= 5000)
  - Anderson-Darling Test
- **Autocorrelation:**
  - Durbin-Watson Test
- **Influential Observations:**
  - Cook's Distance
- **Multicollinearity:**
  - Variance Inflation Factor (VIF)
- **Residual Analysis:** Standardized residuals, leverage (hat matrix diagonal)
- **Dual Target:** Browser (WASM) and server (native Rust)

## Quick Start

### Native Rust

Add to your `Cargo.toml`:

```toml
[dependencies]
linreg-core = { version = "0.1", default-features = false }
```

Use in your code:

```rust
use linreg_core::core::ols_regression;

fn main() -> Result<(), linreg_core::Error> {
    let y = vec![2.5, 3.7, 4.2, 5.1, 6.3];
    let x = vec![vec![1.0, 2.0, 3.0, 4.0, 5.0]];
    let names = vec!["Intercept".to_string(), "X1".to_string()];

    let result = ols_regression(&y, &x, &names)?;

    println!("Coefficients: {:?}", result.coefficients);
    println!("R-squared: {:.4}", result.r_squared);
    println!("F-statistic: {:.4}", result.f_statistic);

    Ok(())
}
```

### WebAssembly (Browser)

Build with wasm-pack:

```bash
wasm-pack build --release --target web
```

Use in JavaScript:

```javascript
import init, { ols_regression } from './pkg/linreg_core.js';

async function run() {
    await init();

    const y = [1, 2, 3, 4, 5];
    const x = [[1, 2, 3, 4, 5]];
    const names = ["Intercept", "X1"];

    const resultJson = ols_regression(
        JSON.stringify(y),
        JSON.stringify(x),
        JSON.stringify(names)
    );

    const result = JSON.parse(resultJson);
    console.log("Coefficients:", result.coefficients);
    console.log("R-squared:", result.r_squared);
}

run();
```

## Diagnostic Tests Example

```rust
use linreg_core::core::ols_regression;
use linreg_core::diagnostics::{
    breusch_pagan_test, durbin_watson_test, jarque_bera_test,
    shapiro_wilk_test, RainbowMethod, rainbow_test
};

fn main() -> Result<(), linreg_core::Error> {
    let y = vec![/* your data */];
    let x = vec![vec![/* predictor 1 */], vec![/* predictor 2 */]];
    let names = vec!["Intercept".into(), "X1".into(), "X2".into()];

    // Run regression
    let result = ols_regression(&y, &x, &names)?;

    // Heteroscedasticity
    let bp = breusch_pagan_test(&y, &x)?;
    println!("Breusch-Pagan: LM={:.4}, p={:.4}", bp.statistic, bp.p_value);

    // Autocorrelation
    let dw = durbin_watson_test(&y, &x)?;
    println!("Durbin-Watson: {:.4}", dw.statistic);

    // Normality
    let jb = jarque_bera_test(&y, &x)?;
    println!("Jarque-Bera: JB={:.4}, p={:.4}", jb.statistic, jb.p_value);

    // Linearity
    let rainbow = rainbow_test(&y, &x, 0.5, RainbowMethod::R)?;
    println!("Rainbow: F={:.4}, p={:.4}",
        rainbow.r_result.as_ref().unwrap().statistic,
        rainbow.r_result.as_ref().unwrap().p_value);

    Ok(())
}
```

## Feature Flags

| Feature | Default | Description |
|---------|---------|-------------|
| `wasm` | Yes | Enables WASM bindings and browser support |
| `validation` | No | Includes test data for validation tests |

For native Rust without WASM overhead:

```toml
linreg-core = { version = "0.1", default-features = false }
```

## Validation

Results are validated against R (`lmtest`, `car`, `skedastic`, `nortest`) and Python (`statsmodels`, `scipy`). See the `verification/` directory for test scripts and reference outputs.

### Running Tests

```bash
# Unit tests
cargo test

# All tests including doctests
cargo test --all-features
```

## Implementation Notes

### Numerical Precision

- QR decomposition used throughout for numerical stability
- Anderson-Darling uses Abramowitz & Stegun 7.1.26 for normal CDF (differs from R's Cephes by ~1e-6)
- Shapiro-Wilk implements Royston's 1995 algorithm matching R's implementation

### Known Limitations

- Harvey-Collier test may fail on high-VIF datasets (VIF > 5) due to numerical instability in recursive residuals
- Shapiro-Wilk limited to n <= 5000 (matching R's limitation)
- White test may differ from R on collinear datasets due to numerical precision in near-singular matrices

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
