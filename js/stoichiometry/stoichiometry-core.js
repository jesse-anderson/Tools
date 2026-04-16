export class ReactionState {
    constructor(speciesArray) {
        // speciesArray: [{ formula: "H2O", coef: 2, molarMass: 18.015, isReactant: true }, ...]
        this.species = speciesArray.map(s => ({
            ...s,
            inputMoles: 0,
            inputMass: 0,
            resultMoles: 0,
            resultMass: 0,
            consumedMoles: 0,
            excessMoles: 0,
            isLimiting: false
        }));
        this.listeners = [];
    }

    _clampNonNegative(value) {
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    subscribe(listener) {
        this.listeners.push(listener);
        listener(this.species);
    }

    notify() {
        this.listeners.forEach(l => l(this.species));
    }

    updateMass(index, newMass) {
        const target = this.species[index];
        target.inputMass = this._clampNonNegative(newMass);
        target.inputMoles = target.molarMass > 0 ? newMass / target.molarMass : 0;
        target.inputMoles = this._clampNonNegative(target.inputMoles);
        this._propagateIfProduct(target);
        this._calculate();
    }

    updateMoles(index, newMoles) {
        const target = this.species[index];
        target.inputMoles = this._clampNonNegative(newMoles);
        target.inputMass = newMoles * target.molarMass;
        target.inputMass = this._clampNonNegative(target.inputMass);
        this._propagateIfProduct(target);
        this._calculate();
    }

    _propagateIfProduct(target) {
        if (target.isReactant) return;
        const baseRatio = target.inputMoles / target.coef;
        this.species.forEach(s => {
            if (s.isReactant) {
                s.inputMoles = baseRatio * s.coef;
                s.inputMass = s.inputMoles * s.molarMass;
            }
        });
    }

    _calculate() {
        // 1. Identify Limiting Reactant
        let minRatio = Infinity;
        let limitingIdx = -1;
        
        // Only consider reactants with positive input
        const activeReactants = this.species.filter(s => s.isReactant && s.inputMoles > 0);
        
        activeReactants.forEach(s => {
            const ratio = s.inputMoles / s.coef;
            if (ratio < minRatio) {
                minRatio = ratio;
                limitingIdx = this.species.indexOf(s);
            }
        });

        const baseRatio = limitingIdx === -1 ? 0 : minRatio;

        // 2. Propagate results
        this.species.forEach((s, idx) => {
            s.isLimiting = (idx === limitingIdx);
            s.resultMoles = baseRatio * s.coef;
            s.resultMass = s.resultMoles * s.molarMass;

            if (s.isReactant) {
                s.consumedMoles = s.resultMoles;
                s.excessMoles = Math.max(0, s.inputMoles - s.consumedMoles);
            }
        });

        this.notify();
    }

    clearAll() {
        this.species.forEach(s => {
            s.inputMoles = 0;
            s.inputMass = 0;
            s.resultMoles = 0;
            s.resultMass = 0;
            s.consumedMoles = 0;
            s.excessMoles = 0;
            s.isLimiting = false;
        });
        this.notify();
    }
}
