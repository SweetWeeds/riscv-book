/* ==========================================================================
   RISC-V Book — 작은 RV32IM 도구 상자
   - 명령어 표 (RV32I + RV64I 전용 명령 + M 확장 + Zicsr 일부)
   - 인코더(encode) / 디코더(decode) / 디스어셈블러(disassemble)
   - 라벨과 의사 명령을 이해하는 2단계 어셈블러(assemble)
   - 한 명령씩 실행하며 무엇이 바뀌었는지 알려 주는 RV32IM 에뮬레이터(Machine)
   교육용이라 성능보다 읽기 쉬움을 우선했다. 모든 값은 32비트로 다루며,
   부호 있는 값은 (value | 0), 부호 없는 값은 (value >>> 0) 으로 맞춘다.
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------ 레지스터 이름 */
  const ABI_NAMES = [
    "zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2",
    "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5",
    "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7",
    "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6",
  ];
  const REGISTER_DESCRIPTIONS = [
    "항상 0 (쓰기는 무시됨)", "복귀 주소 (return address)", "스택 포인터", "전역 포인터", "스레드 포인터",
    "임시 / 대체 링크 레지스터", "임시", "임시",
    "저장 레지스터 / 프레임 포인터", "저장 레지스터", "함수 인자 / 반환값", "함수 인자 / 반환값",
    "함수 인자", "함수 인자", "함수 인자", "함수 인자", "함수 인자", "함수 인자 / 시스템 호출 번호",
    "저장 레지스터", "저장 레지스터", "저장 레지스터", "저장 레지스터", "저장 레지스터", "저장 레지스터",
    "저장 레지스터", "저장 레지스터", "저장 레지스터", "저장 레지스터", "임시", "임시", "임시", "임시",
  ];
  // 함수 호출을 건너서도 값이 보존되어야 하는(피호출자가 책임지는) 레지스터
  const CALLEE_SAVED = new Set([2, 8, 9, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]);

  function registerNumber(name) {
    const text = String(name).trim().toLowerCase();
    if (/^x([0-9]|[12][0-9]|3[01])$/.test(text)) return Number(text.slice(1));
    if (text === "fp") return 8;
    const index = ABI_NAMES.indexOf(text);
    if (index >= 0) return index;
    throw new Error("알 수 없는 레지스터: " + name);
  }

  /* ------------------------------------------------------------ 주요 opcode (명령어 하위 7비트) */
  const OPCODES = {
    LOAD: 0b0000011, MISC_MEM: 0b0001111, OP_IMM: 0b0010011, AUIPC: 0b0010111, OP_IMM_32: 0b0011011,
    STORE: 0b0100011, OP: 0b0110011, LUI: 0b0110111, OP_32: 0b0111011,
    BRANCH: 0b1100011, JALR: 0b1100111, JAL: 0b1101111, SYSTEM: 0b1110011,
  };
  const OPCODE_NAMES = Object.fromEntries(Object.entries(OPCODES).map(([name, value]) => [value, name]));

  /*
   * 명령어 표. format 은 R/I/S/B/U/J, 시프트 즉시값은 "I-shift".
   * extension: 어떤 확장에 속하는지. isRv64Only: RV64에만 있는 명령.
   */
  const INSTRUCTIONS = [
    // U 형식
    { name: "lui", format: "U", opcode: OPCODES.LUI, extension: "I", meaning: "rd ← imm << 12", description: "상위 20비트 즉시값을 레지스터에 싣는다" },
    { name: "auipc", format: "U", opcode: OPCODES.AUIPC, extension: "I", meaning: "rd ← pc + (imm << 12)", description: "pc 기준 상위 주소를 만든다" },
    // J / 점프
    { name: "jal", format: "J", opcode: OPCODES.JAL, extension: "I", meaning: "rd ← pc+4; pc ← pc + imm", description: "점프하고 복귀 주소를 남긴다" },
    { name: "jalr", format: "I", opcode: OPCODES.JALR, funct3: 0, extension: "I", meaning: "rd ← pc+4; pc ← (rs1 + imm) & ~1", description: "레지스터가 가리키는 곳으로 점프" },
    // 분기
    { name: "beq", format: "B", opcode: OPCODES.BRANCH, funct3: 0, extension: "I", meaning: "if rs1 == rs2: pc ← pc + imm", description: "같으면 분기" },
    { name: "bne", format: "B", opcode: OPCODES.BRANCH, funct3: 1, extension: "I", meaning: "if rs1 != rs2: pc ← pc + imm", description: "다르면 분기" },
    { name: "blt", format: "B", opcode: OPCODES.BRANCH, funct3: 4, extension: "I", meaning: "if rs1 < rs2 (부호 있음): pc ← pc + imm", description: "작으면 분기" },
    { name: "bge", format: "B", opcode: OPCODES.BRANCH, funct3: 5, extension: "I", meaning: "if rs1 ≥ rs2 (부호 있음): pc ← pc + imm", description: "크거나 같으면 분기" },
    { name: "bltu", format: "B", opcode: OPCODES.BRANCH, funct3: 6, extension: "I", meaning: "if rs1 < rs2 (부호 없음): pc ← pc + imm", description: "작으면 분기 (부호 없음)" },
    { name: "bgeu", format: "B", opcode: OPCODES.BRANCH, funct3: 7, extension: "I", meaning: "if rs1 ≥ rs2 (부호 없음): pc ← pc + imm", description: "크거나 같으면 분기 (부호 없음)" },
    // 적재
    { name: "lb", format: "I", opcode: OPCODES.LOAD, funct3: 0, extension: "I", meaning: "rd ← sext(M[rs1+imm][7:0])", description: "바이트 적재, 부호 확장" },
    { name: "lh", format: "I", opcode: OPCODES.LOAD, funct3: 1, extension: "I", meaning: "rd ← sext(M[rs1+imm][15:0])", description: "하프워드 적재, 부호 확장" },
    { name: "lw", format: "I", opcode: OPCODES.LOAD, funct3: 2, extension: "I", meaning: "rd ← sext(M[rs1+imm][31:0])", description: "워드 적재" },
    { name: "ld", format: "I", opcode: OPCODES.LOAD, funct3: 3, extension: "I", isRv64Only: true, meaning: "rd ← M[rs1+imm][63:0]", description: "더블워드 적재 (RV64)" },
    { name: "lbu", format: "I", opcode: OPCODES.LOAD, funct3: 4, extension: "I", meaning: "rd ← zext(M[rs1+imm][7:0])", description: "바이트 적재, 0 확장" },
    { name: "lhu", format: "I", opcode: OPCODES.LOAD, funct3: 5, extension: "I", meaning: "rd ← zext(M[rs1+imm][15:0])", description: "하프워드 적재, 0 확장" },
    { name: "lwu", format: "I", opcode: OPCODES.LOAD, funct3: 6, extension: "I", isRv64Only: true, meaning: "rd ← zext(M[rs1+imm][31:0])", description: "워드 적재, 0 확장 (RV64)" },
    // 저장
    { name: "sb", format: "S", opcode: OPCODES.STORE, funct3: 0, extension: "I", meaning: "M[rs1+imm] ← rs2[7:0]", description: "바이트 저장" },
    { name: "sh", format: "S", opcode: OPCODES.STORE, funct3: 1, extension: "I", meaning: "M[rs1+imm] ← rs2[15:0]", description: "하프워드 저장" },
    { name: "sw", format: "S", opcode: OPCODES.STORE, funct3: 2, extension: "I", meaning: "M[rs1+imm] ← rs2[31:0]", description: "워드 저장" },
    { name: "sd", format: "S", opcode: OPCODES.STORE, funct3: 3, extension: "I", isRv64Only: true, meaning: "M[rs1+imm] ← rs2[63:0]", description: "더블워드 저장 (RV64)" },
    // 즉시값 산술·논리
    { name: "addi", format: "I", opcode: OPCODES.OP_IMM, funct3: 0, extension: "I", meaning: "rd ← rs1 + imm", description: "즉시값 더하기" },
    { name: "slti", format: "I", opcode: OPCODES.OP_IMM, funct3: 2, extension: "I", meaning: "rd ← (rs1 < imm) ? 1 : 0", description: "즉시값보다 작은지 (부호 있음)" },
    { name: "sltiu", format: "I", opcode: OPCODES.OP_IMM, funct3: 3, extension: "I", meaning: "rd ← (rs1 <u imm) ? 1 : 0", description: "즉시값보다 작은지 (부호 없음)" },
    { name: "xori", format: "I", opcode: OPCODES.OP_IMM, funct3: 4, extension: "I", meaning: "rd ← rs1 ^ imm", description: "즉시값 XOR" },
    { name: "ori", format: "I", opcode: OPCODES.OP_IMM, funct3: 6, extension: "I", meaning: "rd ← rs1 | imm", description: "즉시값 OR" },
    { name: "andi", format: "I", opcode: OPCODES.OP_IMM, funct3: 7, extension: "I", meaning: "rd ← rs1 & imm", description: "즉시값 AND" },
    { name: "slli", format: "I-shift", opcode: OPCODES.OP_IMM, funct3: 1, funct7: 0b0000000, extension: "I", meaning: "rd ← rs1 << shamt", description: "왼쪽 논리 시프트" },
    { name: "srli", format: "I-shift", opcode: OPCODES.OP_IMM, funct3: 5, funct7: 0b0000000, extension: "I", meaning: "rd ← rs1 >>u shamt", description: "오른쪽 논리 시프트" },
    { name: "srai", format: "I-shift", opcode: OPCODES.OP_IMM, funct3: 5, funct7: 0b0100000, extension: "I", meaning: "rd ← rs1 >>s shamt", description: "오른쪽 산술 시프트" },
    // 레지스터 산술·논리
    { name: "add", format: "R", opcode: OPCODES.OP, funct3: 0, funct7: 0b0000000, extension: "I", meaning: "rd ← rs1 + rs2", description: "더하기" },
    { name: "sub", format: "R", opcode: OPCODES.OP, funct3: 0, funct7: 0b0100000, extension: "I", meaning: "rd ← rs1 − rs2", description: "빼기" },
    { name: "sll", format: "R", opcode: OPCODES.OP, funct3: 1, funct7: 0, extension: "I", meaning: "rd ← rs1 << rs2[4:0]", description: "왼쪽 논리 시프트" },
    { name: "slt", format: "R", opcode: OPCODES.OP, funct3: 2, funct7: 0, extension: "I", meaning: "rd ← (rs1 < rs2) ? 1 : 0", description: "작은지 비교 (부호 있음)" },
    { name: "sltu", format: "R", opcode: OPCODES.OP, funct3: 3, funct7: 0, extension: "I", meaning: "rd ← (rs1 <u rs2) ? 1 : 0", description: "작은지 비교 (부호 없음)" },
    { name: "xor", format: "R", opcode: OPCODES.OP, funct3: 4, funct7: 0, extension: "I", meaning: "rd ← rs1 ^ rs2", description: "XOR" },
    { name: "srl", format: "R", opcode: OPCODES.OP, funct3: 5, funct7: 0, extension: "I", meaning: "rd ← rs1 >>u rs2[4:0]", description: "오른쪽 논리 시프트" },
    { name: "sra", format: "R", opcode: OPCODES.OP, funct3: 5, funct7: 0b0100000, extension: "I", meaning: "rd ← rs1 >>s rs2[4:0]", description: "오른쪽 산술 시프트" },
    { name: "or", format: "R", opcode: OPCODES.OP, funct3: 6, funct7: 0, extension: "I", meaning: "rd ← rs1 | rs2", description: "OR" },
    { name: "and", format: "R", opcode: OPCODES.OP, funct3: 7, funct7: 0, extension: "I", meaning: "rd ← rs1 & rs2", description: "AND" },
    // RV64 전용 32비트(W) 연산
    { name: "addiw", format: "I", opcode: OPCODES.OP_IMM_32, funct3: 0, extension: "I", isRv64Only: true, meaning: "rd ← sext((rs1 + imm)[31:0])", description: "32비트 더하기 후 부호 확장" },
    { name: "slliw", format: "I-shift", opcode: OPCODES.OP_IMM_32, funct3: 1, funct7: 0, extension: "I", isRv64Only: true, meaning: "rd ← sext((rs1 << shamt)[31:0])", description: "32비트 왼쪽 시프트" },
    { name: "srliw", format: "I-shift", opcode: OPCODES.OP_IMM_32, funct3: 5, funct7: 0, extension: "I", isRv64Only: true, meaning: "rd ← sext(rs1[31:0] >>u shamt)", description: "32비트 오른쪽 논리 시프트" },
    { name: "sraiw", format: "I-shift", opcode: OPCODES.OP_IMM_32, funct3: 5, funct7: 0b0100000, extension: "I", isRv64Only: true, meaning: "rd ← sext(rs1[31:0] >>s shamt)", description: "32비트 오른쪽 산술 시프트" },
    { name: "addw", format: "R", opcode: OPCODES.OP_32, funct3: 0, funct7: 0, extension: "I", isRv64Only: true, meaning: "rd ← sext((rs1 + rs2)[31:0])", description: "32비트 더하기" },
    { name: "subw", format: "R", opcode: OPCODES.OP_32, funct3: 0, funct7: 0b0100000, extension: "I", isRv64Only: true, meaning: "rd ← sext((rs1 − rs2)[31:0])", description: "32비트 빼기" },
    { name: "sllw", format: "R", opcode: OPCODES.OP_32, funct3: 1, funct7: 0, extension: "I", isRv64Only: true, meaning: "rd ← sext((rs1 << rs2[4:0])[31:0])", description: "32비트 왼쪽 시프트" },
    { name: "srlw", format: "R", opcode: OPCODES.OP_32, funct3: 5, funct7: 0, extension: "I", isRv64Only: true, meaning: "rd ← sext(rs1[31:0] >>u rs2[4:0])", description: "32비트 오른쪽 논리 시프트" },
    { name: "sraw", format: "R", opcode: OPCODES.OP_32, funct3: 5, funct7: 0b0100000, extension: "I", isRv64Only: true, meaning: "rd ← sext(rs1[31:0] >>s rs2[4:0])", description: "32비트 오른쪽 산술 시프트" },
    // 메모리 순서와 시스템
    { name: "fence", format: "I", opcode: OPCODES.MISC_MEM, funct3: 0, defaultImmediate: 0x0ff, extension: "I", meaning: "메모리 접근 순서 보장", description: "앞뒤 메모리 접근의 순서를 맞춘다" },
    { name: "fence.i", format: "I", opcode: OPCODES.MISC_MEM, funct3: 1, extension: "Zifencei", meaning: "명령어 캐시 동기화", description: "자기 수정 코드를 위한 명령어 펜스" },
    { name: "ecall", format: "I", opcode: OPCODES.SYSTEM, funct3: 0, fixedImmediate: 0, extension: "I", meaning: "환경 호출 (트랩)", description: "운영체제·펌웨어에 서비스 요청" },
    { name: "ebreak", format: "I", opcode: OPCODES.SYSTEM, funct3: 0, fixedImmediate: 1, extension: "I", meaning: "디버거로 제어 넘김 (트랩)", description: "중단점" },
    // Zicsr
    { name: "csrrw", format: "I-csr", opcode: OPCODES.SYSTEM, funct3: 1, extension: "Zicsr", meaning: "rd ← csr; csr ← rs1", description: "CSR 읽고 쓰기" },
    { name: "csrrs", format: "I-csr", opcode: OPCODES.SYSTEM, funct3: 2, extension: "Zicsr", meaning: "rd ← csr; csr ← csr | rs1", description: "CSR 읽고 비트 세우기" },
    { name: "csrrc", format: "I-csr", opcode: OPCODES.SYSTEM, funct3: 3, extension: "Zicsr", meaning: "rd ← csr; csr ← csr & ~rs1", description: "CSR 읽고 비트 지우기" },
    { name: "csrrwi", format: "I-csr", opcode: OPCODES.SYSTEM, funct3: 5, extension: "Zicsr", meaning: "rd ← csr; csr ← uimm", description: "CSR 읽고 즉시값 쓰기" },
    { name: "csrrsi", format: "I-csr", opcode: OPCODES.SYSTEM, funct3: 6, extension: "Zicsr", meaning: "rd ← csr; csr ← csr | uimm", description: "CSR 읽고 즉시값 비트 세우기" },
    { name: "csrrci", format: "I-csr", opcode: OPCODES.SYSTEM, funct3: 7, extension: "Zicsr", meaning: "rd ← csr; csr ← csr & ~uimm", description: "CSR 읽고 즉시값 비트 지우기" },
    // M 확장
    { name: "mul", format: "R", opcode: OPCODES.OP, funct3: 0, funct7: 1, extension: "M", meaning: "rd ← (rs1 × rs2)[31:0]", description: "곱의 하위 절반" },
    { name: "mulh", format: "R", opcode: OPCODES.OP, funct3: 1, funct7: 1, extension: "M", meaning: "rd ← (rs1 ×s rs2)[63:32]", description: "곱의 상위 절반 (부호×부호)" },
    { name: "mulhsu", format: "R", opcode: OPCODES.OP, funct3: 2, funct7: 1, extension: "M", meaning: "rd ← (rs1 ×s rs2 ×u)[63:32]", description: "곱의 상위 절반 (부호×무부호)" },
    { name: "mulhu", format: "R", opcode: OPCODES.OP, funct3: 3, funct7: 1, extension: "M", meaning: "rd ← (rs1 ×u rs2)[63:32]", description: "곱의 상위 절반 (무부호×무부호)" },
    { name: "div", format: "R", opcode: OPCODES.OP, funct3: 4, funct7: 1, extension: "M", meaning: "rd ← rs1 ÷s rs2", description: "나눗셈 (부호 있음, 0 쪽으로 버림)" },
    { name: "divu", format: "R", opcode: OPCODES.OP, funct3: 5, funct7: 1, extension: "M", meaning: "rd ← rs1 ÷u rs2", description: "나눗셈 (부호 없음)" },
    { name: "rem", format: "R", opcode: OPCODES.OP, funct3: 6, funct7: 1, extension: "M", meaning: "rd ← rs1 mod s rs2", description: "나머지 (부호 있음)" },
    { name: "remu", format: "R", opcode: OPCODES.OP, funct3: 7, funct7: 1, extension: "M", meaning: "rd ← rs1 mod u rs2", description: "나머지 (부호 없음)" },
  ];
  const INSTRUCTIONS_BY_NAME = Object.fromEntries(INSTRUCTIONS.map((instruction) => [instruction.name, instruction]));

  /* ------------------------------------------------------------ 비트 도우미 */
  const bits = (value, high, low) => (value >>> low) & ((high - low === 31) ? 0xffffffff : ((1 << (high - low + 1)) - 1));
  const signExtend = (value, bitWidth) => {
    const shift = 32 - bitWidth;
    return (value << shift) >> shift;
  };

  /*
   * 형식마다 즉시값 비트가 명령어 어디에 들어가는지를 적은 표.
   * 각 항목: [즉시값 상위 비트, 즉시값 하위 비트, 명령어 상위 비트, 명령어 하위 비트]
   * 그림으로 "즉시값 비트가 흩어져 있는 모습"을 보여 줄 때 이 표를 그대로 쓴다.
   */
  const IMMEDIATE_LAYOUTS = {
    I: [[11, 0, 31, 20]],
    S: [[11, 5, 31, 25], [4, 0, 11, 7]],
    B: [[12, 12, 31, 31], [10, 5, 30, 25], [4, 1, 11, 8], [11, 11, 7, 7]],
    U: [[31, 12, 31, 12]],
    J: [[20, 20, 31, 31], [10, 1, 30, 21], [11, 11, 20, 20], [19, 12, 19, 12]],
  };

  /*
   * 형식마다 명령어 필드 배치 (상위 비트부터). 그림과 디코더가 함께 쓴다.
   * kind: opcode | register | immediate | function
   */
  const FORMAT_FIELDS = {
    R: [["funct7", 31, 25, "function"], ["rs2", 24, 20, "register"], ["rs1", 19, 15, "register"], ["funct3", 14, 12, "function"], ["rd", 11, 7, "register"], ["opcode", 6, 0, "opcode"]],
    I: [["imm[11:0]", 31, 20, "immediate"], ["rs1", 19, 15, "register"], ["funct3", 14, 12, "function"], ["rd", 11, 7, "register"], ["opcode", 6, 0, "opcode"]],
    S: [["imm[11:5]", 31, 25, "immediate"], ["rs2", 24, 20, "register"], ["rs1", 19, 15, "register"], ["funct3", 14, 12, "function"], ["imm[4:0]", 11, 7, "immediate"], ["opcode", 6, 0, "opcode"]],
    B: [["imm[12]", 31, 31, "immediate"], ["imm[10:5]", 30, 25, "immediate"], ["rs2", 24, 20, "register"], ["rs1", 19, 15, "register"], ["funct3", 14, 12, "function"], ["imm[4:1]", 11, 8, "immediate"], ["imm[11]", 7, 7, "immediate"], ["opcode", 6, 0, "opcode"]],
    U: [["imm[31:12]", 31, 12, "immediate"], ["rd", 11, 7, "register"], ["opcode", 6, 0, "opcode"]],
    J: [["imm[20]", 31, 31, "immediate"], ["imm[10:1]", 30, 21, "immediate"], ["imm[11]", 20, 20, "immediate"], ["imm[19:12]", 19, 12, "immediate"], ["rd", 11, 7, "register"], ["opcode", 6, 0, "opcode"]],
  };
  FORMAT_FIELDS["I-shift"] = [["funct7", 31, 25, "function"], ["shamt", 24, 20, "immediate"], ["rs1", 19, 15, "register"], ["funct3", 14, 12, "function"], ["rd", 11, 7, "register"], ["opcode", 6, 0, "opcode"]];
  FORMAT_FIELDS["I-csr"] = [["csr", 31, 20, "immediate"], ["rs1/uimm", 19, 15, "register"], ["funct3", 14, 12, "function"], ["rd", 11, 7, "register"], ["opcode", 6, 0, "opcode"]];

  function baseFormat(format) {
    if (format === "I-shift" || format === "I-csr") return "I";
    return format;
  }

  /** 즉시값을 형식에 맞게 명령어 비트로 흩어 놓는다 */
  function scatterImmediate(format, immediate) {
    const layout = IMMEDIATE_LAYOUTS[baseFormat(format)];
    if (!layout) return 0;
    let word = 0;
    layout.forEach(([immediateHigh, immediateLow, , instructionLow]) => {
      word |= bits(immediate, immediateHigh, immediateLow) << instructionLow;
    });
    return word >>> 0;
  }

  /** 명령어 비트에 흩어진 즉시값을 다시 모은다 (부호 확장 포함) */
  function gatherImmediate(format, word) {
    const base = baseFormat(format);
    const layout = IMMEDIATE_LAYOUTS[base];
    if (!layout) return 0;
    let immediate = 0;
    layout.forEach(([, immediateLow, instructionHigh, instructionLow]) => {
      immediate |= bits(word, instructionHigh, instructionLow) << immediateLow;
    });
    if (base === "U") return immediate | 0;
    const signBitPosition = { I: 11, S: 11, B: 12, J: 20 }[base];
    return signExtend(immediate, signBitPosition + 1);
  }

  /* ------------------------------------------------------------ 인코더 */
  /**
   * operands: { rd, rs1, rs2, immediate, csr }
   * 반환: 32비트 부호 없는 정수
   */
  function encode(name, operands) {
    const instruction = INSTRUCTIONS_BY_NAME[name];
    if (!instruction) throw new Error("지원하지 않는 명령: " + name);
    const values = Object.assign({ rd: 0, rs1: 0, rs2: 0, immediate: 0, csr: 0 }, operands || {});
    const format = instruction.format;
    let word = instruction.opcode;
    if (format !== "U" && format !== "J") word |= (instruction.funct3 || 0) << 12;
    if (format === "R") word |= (values.rd << 7) | (values.rs1 << 15) | (values.rs2 << 20) | ((instruction.funct7 || 0) << 25);
    if (format === "I") {
      let immediate = values.immediate;
      if (instruction.fixedImmediate !== undefined) immediate = instruction.fixedImmediate;
      // 피연산자 없이 쓴 fence 는 어셈블러처럼 fence iorw, iorw 로 인코딩한다 (pred=succ=0 은 HINT 공간)
      else if (instruction.defaultImmediate !== undefined && (operands || {}).immediate === undefined) immediate = instruction.defaultImmediate;
      checkImmediateRange(name, immediate, -2048, 2047);
      word |= (values.rd << 7) | (values.rs1 << 15) | scatterImmediate("I", immediate);
    }
    if (format === "I-shift") {
      checkImmediateRange(name, values.immediate, 0, 31);
      word |= (values.rd << 7) | (values.rs1 << 15) | ((values.immediate & 31) << 20) | ((instruction.funct7 || 0) << 25);
    }
    if (format === "I-csr") word |= (values.rd << 7) | (values.rs1 << 15) | ((values.csr & 0xfff) << 20);
    if (format === "S") { checkImmediateRange(name, values.immediate, -2048, 2047); word |= (values.rs1 << 15) | (values.rs2 << 20) | scatterImmediate("S", values.immediate); }
    if (format === "B") { checkImmediateRange(name, values.immediate, -4096, 4094); checkEven(name, values.immediate); word |= (values.rs1 << 15) | (values.rs2 << 20) | scatterImmediate("B", values.immediate); }
    if (format === "U") { checkImmediateRange(name, values.immediate, 0, 0xfffff); word |= (values.rd << 7) | ((values.immediate & 0xfffff) << 12); }
    if (format === "J") { checkImmediateRange(name, values.immediate, -(1 << 20), (1 << 20) - 2); checkEven(name, values.immediate); word |= (values.rd << 7) | scatterImmediate("J", values.immediate); }
    return word >>> 0;
  }
  function checkImmediateRange(name, value, minimum, maximum) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(name + "의 즉시값 " + value + "이(가) 범위 [" + minimum + ", " + maximum + "]를 벗어났습니다");
    }
  }
  function checkEven(name, value) {
    if (value % 2 !== 0) throw new Error(name + "의 오프셋은 2의 배수여야 합니다 (" + value + ")");
  }

  /* ------------------------------------------------------------ 디코더 */
  /**
   * 32비트 명령어를 해독한다.
   * 반환: { word, name, format, instruction, rd, rs1, rs2, immediate, csr, fields: [{name, high, low, kind, value}] }
   * 알 수 없는 명령이면 name 이 null 이다.
   */
  function decode(word) {
    const value = word >>> 0;
    const opcode = bits(value, 6, 0);
    const funct3 = bits(value, 14, 12);
    const funct7 = bits(value, 31, 25);
    const candidates = INSTRUCTIONS.filter((instruction) => instruction.opcode === opcode);
    let match = null;
    for (const instruction of candidates) {
      const format = instruction.format;
      if (format === "U" || format === "J") { match = instruction; break; }
      if (instruction.funct3 !== funct3) continue;
      // 이 도구 상자는 RV32 기준이므로 시프트도 funct7 전체를 비교한다 (shamt[5]=1 은 RV32에서 예약된 인코딩)
      if ((format === "R" || format === "I-shift") && funct7 !== (instruction.funct7 || 0)) continue;
      if (instruction.fixedImmediate !== undefined) {
        // ecall/ebreak 는 rd 와 rs1 도 0 이어야 한다
        if (bits(value, 31, 20) !== instruction.fixedImmediate || bits(value, 11, 7) !== 0 || bits(value, 19, 15) !== 0) continue;
      }
      match = instruction;
      break;
    }
    const result = {
      word: value, name: match ? match.name : null, format: match ? match.format : null, instruction: match,
      opcode, funct3, funct7, rd: bits(value, 11, 7), rs1: bits(value, 19, 15), rs2: bits(value, 24, 20),
      immediate: 0, csr: bits(value, 31, 20), fields: [],
    };
    if (!match) {
      result.fields = [{ name: "opcode", high: 6, low: 0, kind: "opcode", value: opcode }];
      return result;
    }
    if (match.format === "I-shift") result.immediate = bits(value, 24, 20);
    else if (match.format === "U") result.immediate = bits(value, 31, 12);
    else if (match.format !== "R" && match.format !== "I-csr") result.immediate = gatherImmediate(match.format, value);
    result.fields = FORMAT_FIELDS[match.format].map(([name, high, low, kind]) => ({ name, high, low, kind, value: bits(value, high, low) }));
    return result;
  }

  /* ------------------------------------------------------------ 디스어셈블러 */
  function disassemble(word, options) {
    const settings = Object.assign({ useAbiNames: true, address: null }, options || {});
    const decoded = decode(word);
    const registerName = (number) => (settings.useAbiNames ? ABI_NAMES[number] : "x" + number);
    if (!decoded.name) return "(알 수 없음 " + "0x" + (word >>> 0).toString(16).padStart(8, "0") + ")";
    const { name, rd, rs1, rs2, immediate } = decoded;
    const format = decoded.format;
    if (name === "ecall" || name === "ebreak" || name === "fence.i") return name;
    if (name === "fence") return "fence";
    if (format === "R") return name + " " + registerName(rd) + ", " + registerName(rs1) + ", " + registerName(rs2);
    if (format === "I-shift") return name + " " + registerName(rd) + ", " + registerName(rs1) + ", " + immediate;
    if (format === "I-csr") {
      const source = name.endsWith("i") ? String(rs1) : registerName(rs1);
      return name + " " + registerName(rd) + ", 0x" + decoded.csr.toString(16) + ", " + source;
    }
    if (format === "I" && decoded.opcode === OPCODES.LOAD) return name + " " + registerName(rd) + ", " + immediate + "(" + registerName(rs1) + ")";
    if (name === "jalr") return name + " " + registerName(rd) + ", " + immediate + "(" + registerName(rs1) + ")";
    if (format === "I") return name + " " + registerName(rd) + ", " + registerName(rs1) + ", " + immediate;
    if (format === "S") return name + " " + registerName(rs2) + ", " + immediate + "(" + registerName(rs1) + ")";
    const targetText = (offset) => (settings.address !== null ? "0x" + ((settings.address + offset) >>> 0).toString(16) : (offset >= 0 ? "+" : "") + offset);
    if (format === "B") return name + " " + registerName(rs1) + ", " + registerName(rs2) + ", " + targetText(immediate);
    if (format === "U") return name + " " + registerName(rd) + ", 0x" + immediate.toString(16);
    if (format === "J") return name + " " + registerName(rd) + ", " + targetText(immediate);
    return name;
  }

  /* ------------------------------------------------------------ 어셈블러 */
  const TEXT_BASE_ADDRESS = 0x00000000;
  const DATA_BASE_ADDRESS = 0x00002000;

  function parseInteger(text) {
    const cleaned = String(text).trim().replace(/_/g, "");
    if (/^'.'$/.test(cleaned)) return cleaned.charCodeAt(1);
    if (!/^[-+]?(0x[0-9a-f]+|0b[01]+|[0-9]+)$/i.test(cleaned)) return null;
    const isNegative = cleaned.startsWith("-");
    const body = cleaned.replace(/^[-+]/, "");
    let magnitude;
    if (/^0x/i.test(body)) magnitude = parseInt(body.slice(2), 16);
    else if (/^0b/i.test(body)) magnitude = parseInt(body.slice(2), 2);
    else magnitude = parseInt(body, 10);
    return isNegative ? -magnitude : magnitude;
  }

  /** 줄 하나를 "명령 이름"과 "피연산자 목록"으로 나눈다. 주석(#, //)은 버린다. */
  function splitLine(rawLine) {
    let line = rawLine.replace(/(#|\/\/).*$/, "").trim();
    const labels = [];
    let labelMatch;
    while ((labelMatch = line.match(/^([A-Za-z_.$][\w.$]*):\s*/))) {
      labels.push(labelMatch[1]);
      line = line.slice(labelMatch[0].length);
    }
    if (!line) return { labels, mnemonic: null, operands: [] };
    const firstSpace = line.search(/\s/);
    const mnemonic = (firstSpace < 0 ? line : line.slice(0, firstSpace)).toLowerCase();
    const rest = firstSpace < 0 ? "" : line.slice(firstSpace).trim();
    const operands = rest ? rest.split(",").map((operand) => operand.trim()).filter((operand) => operand.length) : [];
    return { labels, mnemonic, operands };
  }

  /** 32비트 상수를 lui + addi 로 나눌 때의 상위/하위 값. addi 가 부호 확장하므로 하위가 음수면 상위에 1을 더한다. */
  function splitUpperLower(value) {
    const lower = signExtend(value & 0xfff, 12);
    const upper = ((value - lower) >>> 12) & 0xfffff;
    return { upper, lower };
  }

  /*
   * 의사 명령을 실제 명령 목록으로 바꾼다.
   * 반환 항목: { name, operands: [문자열...] }  — 2단계에서 라벨을 숫자로 바꾼다.
   * li 는 값 크기에 따라 1개 또는 2개 명령이 되므로, 라벨에 의존하지 않는 값만 받는다.
   */
  function expandPseudoInstruction(mnemonic, operands) {
    const operand = (index) => operands[index];
    switch (mnemonic) {
      case "nop": return [{ name: "addi", operands: ["zero", "zero", "0"] }];
      case "mv": return [{ name: "addi", operands: [operand(0), operand(1), "0"] }];
      case "not": return [{ name: "xori", operands: [operand(0), operand(1), "-1"] }];
      case "neg": return [{ name: "sub", operands: [operand(0), "zero", operand(1)] }];
      case "seqz": return [{ name: "sltiu", operands: [operand(0), operand(1), "1"] }];
      case "snez": return [{ name: "sltu", operands: [operand(0), "zero", operand(1)] }];
      case "sltz": return [{ name: "slt", operands: [operand(0), operand(1), "zero"] }];
      case "sgtz": return [{ name: "slt", operands: [operand(0), "zero", operand(1)] }];
      case "beqz": return [{ name: "beq", operands: [operand(0), "zero", operand(1)] }];
      case "bnez": return [{ name: "bne", operands: [operand(0), "zero", operand(1)] }];
      case "blez": return [{ name: "bge", operands: ["zero", operand(0), operand(1)] }];
      case "bgez": return [{ name: "bge", operands: [operand(0), "zero", operand(1)] }];
      case "bltz": return [{ name: "blt", operands: [operand(0), "zero", operand(1)] }];
      case "bgtz": return [{ name: "blt", operands: ["zero", operand(0), operand(1)] }];
      case "bgt": return [{ name: "blt", operands: [operand(1), operand(0), operand(2)] }];
      case "ble": return [{ name: "bge", operands: [operand(1), operand(0), operand(2)] }];
      case "bgtu": return [{ name: "bltu", operands: [operand(1), operand(0), operand(2)] }];
      case "bleu": return [{ name: "bgeu", operands: [operand(1), operand(0), operand(2)] }];
      case "j": return [{ name: "jal", operands: ["zero", operand(0)] }];
      case "jr": return [{ name: "jalr", operands: ["zero", "0(" + operand(0) + ")"] }];
      case "ret": return [{ name: "jalr", operands: ["zero", "0(ra)"] }];
      case "call": return [{ name: "jal", operands: ["ra", operand(0)] }];
      case "tail": return [{ name: "jal", operands: ["zero", operand(0)] }];
      case "la": return [{ name: "auipc", operands: [operand(0), "%pcrel_hi(" + operand(1) + ")"] }, { name: "addi", operands: [operand(0), operand(0), "%pcrel_lo(" + operand(1) + ")"] }];
      case "li": {
        const value = parseInteger(operand(1));
        if (value === null) throw new Error("li 에는 숫자 상수가 와야 합니다: " + operand(1));
        const wrapped = value | 0;
        if (wrapped >= -2048 && wrapped <= 2047) return [{ name: "addi", operands: [operand(0), "zero", String(wrapped)] }];
        const { upper, lower } = splitUpperLower(wrapped);
        const expansion = [{ name: "lui", operands: [operand(0), String(upper)] }];
        if (lower !== 0) expansion.push({ name: "addi", operands: [operand(0), operand(0), String(lower)] });
        return expansion;
      }
      case "jal":
        if (operands.length === 1) return [{ name: "jal", operands: ["ra", operand(0)] }];
        return null;
      case "jalr":
        if (operands.length === 1) return [{ name: "jalr", operands: ["ra", "0(" + operand(0) + ")"] }];
        return null;
      case "csrr": return [{ name: "csrrs", operands: [operand(0), operand(1), "zero"] }];
      case "csrw": return [{ name: "csrrw", operands: ["zero", operand(0), operand(1)] }];
      default: return null;
    }
  }

  const CSR_NAMES = {
    cycle: 0xc00, time: 0xc01, instret: 0xc02, cycleh: 0xc80, timeh: 0xc81, instreth: 0xc82,
    mstatus: 0x300, misa: 0x301, medeleg: 0x302, mideleg: 0x303, mie: 0x304, mtvec: 0x305,
    mscratch: 0x340, mepc: 0x341, mcause: 0x342, mtval: 0x343, mip: 0x344,
    sstatus: 0x100, sie: 0x104, stvec: 0x105, sscratch: 0x140, sepc: 0x141, scause: 0x142, stval: 0x143, sip: 0x144, satp: 0x180,
    mhartid: 0xf14, mvendorid: 0xf11, marchid: 0xf12, mimpid: 0xf13, fflags: 0x001, frm: 0x002, fcsr: 0x003,
  };

  /**
   * 어셈블리 소스를 기계어로 바꾼다.
   * 지원: 라벨, 의사 명령, .text/.data, .word/.half/.byte/.space/.string/.asciz/.align
   * 반환: { words: [{address, word, line, source, text}], data: Uint8Array 조각들, labels, errors }
   * 오류가 있어도 멈추지 않고 errors 에 { line, message } 를 모아 돌려준다.
   */
  function assemble(source) {
    const lines = String(source).split("\n");
    const labels = {};
    const errors = [];
    const items = [];
    const dataBytes = [];
    let section = "text";
    let textAddress = TEXT_BASE_ADDRESS;
    let dataAddress = DATA_BASE_ADDRESS;

    // 1단계: 주소를 매기고 라벨 위치를 기록한다
    lines.forEach((rawLine, lineIndex) => {
      const lineNumber = lineIndex + 1;
      let parsed;
      try { parsed = splitLine(rawLine); } catch (error) { errors.push({ line: lineNumber, message: error.message }); return; }
      parsed.labels.forEach((label) => {
        if (labels[label] !== undefined) errors.push({ line: lineNumber, message: "라벨 중복: " + label });
        labels[label] = section === "text" ? textAddress : dataAddress;
      });
      const { mnemonic, operands } = parsed;
      if (!mnemonic) return;
      if (mnemonic === ".text") { section = "text"; return; }
      if (mnemonic === ".data") { section = "data"; return; }
      if (mnemonic === ".globl" || mnemonic === ".global" || mnemonic === ".section") return;
      if (mnemonic.startsWith(".")) {
        if (section !== "data") { errors.push({ line: lineNumber, message: "데이터 지시어는 .data 구역에서만 씁니다: " + mnemonic }); return; }
        try {
          const bytes = directiveBytes(mnemonic, operands, rawLine, dataAddress);
          dataBytes.push({ address: dataAddress, bytes, line: lineNumber });
          dataAddress += bytes.length;
        } catch (error) { errors.push({ line: lineNumber, message: error.message }); }
        return;
      }
      if (section === "data") { errors.push({ line: lineNumber, message: "명령어는 .text 구역에 써야 합니다" }); return; }
      let expansion;
      try { expansion = expandPseudoInstruction(mnemonic, operands); } catch (error) { errors.push({ line: lineNumber, message: error.message }); return; }
      if (!expansion) {
        if (!INSTRUCTIONS_BY_NAME[mnemonic]) { errors.push({ line: lineNumber, message: "모르는 명령: " + mnemonic }); return; }
        expansion = [{ name: mnemonic, operands }];
      }
      expansion.forEach((part, partIndex) => {
        items.push({ address: textAddress, name: part.name, operands: part.operands, line: lineNumber, source: rawLine.trim(), isPseudoExpansion: expansion.length > 1 || part.name !== mnemonic, partIndex });
        textAddress += 4;
      });
    });

    // 2단계: 라벨을 숫자로 바꾸고 인코딩한다
    const words = [];
    items.forEach((item) => {
      try {
        const operandValues = resolveOperands(item, labels);
        const word = encode(item.name, operandValues);
        words.push({ address: item.address, word, line: item.line, source: item.source, text: disassemble(word, { address: item.address }), isPseudoExpansion: item.isPseudoExpansion });
      } catch (error) {
        errors.push({ line: item.line, message: error.message });
      }
    });
    return { words, data: dataBytes, labels, errors, textEnd: textAddress, dataEnd: dataAddress };
  }

  function directiveBytes(mnemonic, operands, rawLine, address) {
    const littleEndian = (value, byteCount) => Array.from({ length: byteCount }, (_, index) => (value >>> (8 * index)) & 0xff);
    const numbers = () => operands.map((operand) => { const value = parseInteger(operand); if (value === null) throw new Error("숫자가 아닙니다: " + operand); return value; });
    switch (mnemonic) {
      case ".word": return numbers().flatMap((value) => littleEndian(value, 4));
      case ".half": return numbers().flatMap((value) => littleEndian(value, 2));
      case ".byte": return numbers().flatMap((value) => littleEndian(value, 1));
      case ".space": case ".zero": return new Array(numbers()[0]).fill(0);
      case ".align": { const alignment = 1 << numbers()[0]; const padding = (alignment - (address % alignment)) % alignment; return new Array(padding).fill(0); }
      case ".string": case ".asciz": case ".ascii": {
        const match = rawLine.match(/"((?:[^"\\]|\\.)*)"/);
        if (!match) throw new Error("문자열이 필요합니다");
        const text = match[1].replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        const bytes = [...new TextEncoder().encode(text)];
        if (mnemonic !== ".ascii") bytes.push(0);
        return bytes;
      }
      default: throw new Error("지원하지 않는 지시어: " + mnemonic);
    }
  }

  function resolveValue(text, labels, item) {
    const relocation = text.match(/^%(pcrel_hi|pcrel_lo|hi|lo)\((.+)\)$/);
    if (relocation) {
      const kind = relocation[1];
      const target = resolveValue(relocation[2], labels, item);
      if (kind === "hi") return splitUpperLower(target).upper;
      if (kind === "lo") return splitUpperLower(target).lower;
      // pcrel_lo 는 짝이 되는 auipc(바로 앞 명령) 주소 기준이다
      const anchorAddress = kind === "pcrel_hi" ? item.address : item.address - 4;
      const split = splitUpperLower((target - anchorAddress) | 0);
      return kind === "pcrel_hi" ? split.upper : split.lower;
    }
    const number = parseInteger(text);
    if (number !== null) return number;
    if (labels[text] !== undefined) return labels[text];
    if (CSR_NAMES[text.toLowerCase()] !== undefined) return CSR_NAMES[text.toLowerCase()];
    throw new Error("알 수 없는 값 또는 라벨: " + text);
  }

  function resolveOperands(item, labels) {
    const instruction = INSTRUCTIONS_BY_NAME[item.name];
    const operands = item.operands;
    const format = instruction.format;
    const expectCount = (count) => { if (operands.length !== count) throw new Error(item.name + " 에는 피연산자 " + count + "개가 필요합니다 (" + operands.length + "개 받음)"); };
    const memoryOperand = (text) => {
      const match = text.match(/^(.*)\(\s*([\w]+)\s*\)$/);
      if (!match) throw new Error("메모리 피연산자는 offset(레지스터) 꼴이어야 합니다: " + text);
      return { offset: match[1].trim() ? resolveValue(match[1].trim(), labels, item) : 0, base: registerNumber(match[2]) };
    };
    const relativeTarget = (text) => {
      const number = parseInteger(text);
      if (number !== null) return number; // 숫자는 이미 오프셋으로 본다
      return resolveValue(text, labels, item) - item.address;
    };
    if (["ecall", "ebreak", "fence", "fence.i"].includes(item.name)) return {};
    if (format === "R") { expectCount(3); return { rd: registerNumber(operands[0]), rs1: registerNumber(operands[1]), rs2: registerNumber(operands[2]) }; }
    if (format === "I-shift") { expectCount(3); return { rd: registerNumber(operands[0]), rs1: registerNumber(operands[1]), immediate: resolveValue(operands[2], labels, item) }; }
    if (format === "I-csr") {
      expectCount(3);
      const isImmediateForm = item.name.endsWith("i");
      return { rd: registerNumber(operands[0]), csr: resolveValue(operands[1], labels, item), rs1: isImmediateForm ? resolveValue(operands[2], labels, item) & 31 : registerNumber(operands[2]) };
    }
    if (format === "I") {
      if (instruction.opcode === OPCODES.LOAD || item.name === "jalr") {
        if (operands.length === 3) return { rd: registerNumber(operands[0]), rs1: registerNumber(operands[1]), immediate: resolveValue(operands[2], labels, item) };
        expectCount(2);
        const memory = memoryOperand(operands[1]);
        return { rd: registerNumber(operands[0]), rs1: memory.base, immediate: memory.offset };
      }
      expectCount(3);
      return { rd: registerNumber(operands[0]), rs1: registerNumber(operands[1]), immediate: resolveValue(operands[2], labels, item) };
    }
    if (format === "S") { expectCount(2); const memory = memoryOperand(operands[1]); return { rs2: registerNumber(operands[0]), rs1: memory.base, immediate: memory.offset }; }
    if (format === "B") { expectCount(3); return { rs1: registerNumber(operands[0]), rs2: registerNumber(operands[1]), immediate: relativeTarget(operands[2]) }; }
    if (format === "U") { expectCount(2); return { rd: registerNumber(operands[0]), immediate: resolveValue(operands[1], labels, item) & 0xfffff }; }
    if (format === "J") { expectCount(2); return { rd: registerNumber(operands[0]), immediate: relativeTarget(operands[1]) }; }
    throw new Error("처리할 수 없는 형식: " + format);
  }

  /* ------------------------------------------------------------ 에뮬레이터 */
  const DEFAULT_MEMORY_SIZE = 64 * 1024;
  // 교육용 시스템 호출 번호 (RARS/Venus와 비슷한 약속). a7 에 번호, a0 에 인자.
  const SYSTEM_CALL = { PRINT_INTEGER: 1, PRINT_STRING: 4, EXIT: 10, PRINT_CHARACTER: 11, EXIT_WITH_CODE: 93 };

  class Machine {
    constructor(memorySize) {
      this.memory = new Uint8Array(memorySize || DEFAULT_MEMORY_SIZE);
      this.registers = new Int32Array(32);
      this.pc = 0;
      this.isHalted = false;
      this.output = "";
      this.instructionCount = 0;
      this.exitCode = null;
      this.program = null;
      this.csrs = { 0xc00: 0, 0xc02: 0 };
    }

    /** 어셈블 결과(또는 소스 문자열)를 메모리에 싣고 레지스터를 초기화한다 */
    load(programOrSource) {
      const program = typeof programOrSource === "string" ? assemble(programOrSource) : programOrSource;
      this.memory.fill(0);
      this.registers.fill(0);
      this.registers[2] = this.memory.length - 16; // sp: 메모리 끝 근처에서 아래로 자란다
      this.registers[3] = DATA_BASE_ADDRESS + 0x800; // gp
      this.pc = TEXT_BASE_ADDRESS;
      this.isHalted = false;
      this.output = "";
      this.instructionCount = 0;
      this.exitCode = null;
      this.program = program;
      program.words.forEach((entry) => this.writeMemory(entry.address, entry.word, 4));
      program.data.forEach((chunk) => chunk.bytes.forEach((byte, index) => { this.memory[chunk.address + index] = byte; }));
      return program;
    }

    checkAddress(address, byteCount) {
      if (address < 0 || address + byteCount > this.memory.length) throw new MachineError("메모리 범위 밖 접근: 0x" + (address >>> 0).toString(16), "access-fault");
    }
    readMemory(address, byteCount, isSigned) {
      const unsignedAddress = address >>> 0;
      this.checkAddress(unsignedAddress, byteCount);
      let value = 0;
      for (let index = byteCount - 1; index >= 0; index -= 1) value = (value << 8) | this.memory[unsignedAddress + index];
      if (byteCount === 4) return isSigned ? value | 0 : value >>> 0;
      return isSigned ? signExtend(value, byteCount * 8) : value;
    }
    writeMemory(address, value, byteCount) {
      const unsignedAddress = address >>> 0;
      this.checkAddress(unsignedAddress, byteCount);
      for (let index = 0; index < byteCount; index += 1) this.memory[unsignedAddress + index] = (value >>> (8 * index)) & 0xff;
    }
    setRegister(number, value) {
      if (number !== 0) this.registers[number] = value | 0;
    }

    /**
     * 명령 하나를 실행한다.
     * 반환: { pc, word, text, decoded, registerWrite: {number, before, after} | null,
     *         memoryRead: {address, size, value} | null, memoryWrite: {address, size, before, after} | null,
     *         nextPc, isBranch, isBranchTaken, isHalted, error }
     */
    step() {
      if (this.isHalted) return { isHalted: true };
      const record = { pc: this.pc, registerWrite: null, memoryRead: null, memoryWrite: null, isBranch: false, isBranchTaken: false, error: null };
      try {
        if (this.pc % 4 !== 0) throw new MachineError("명령어 주소가 4의 배수가 아님: 0x" + this.pc.toString(16), "misaligned-fetch");
        const word = this.readMemory(this.pc, 4, false);
        const decoded = decode(word);
        record.word = word;
        record.decoded = decoded;
        record.text = disassemble(word, { address: this.pc });
        if (!decoded.name) throw new MachineError("알 수 없는 명령 0x" + word.toString(16).padStart(8, "0"), "illegal-instruction");
        if (decoded.instruction.isRv64Only) throw new MachineError(decoded.name + " 은(는) RV64 전용 명령입니다", "illegal-instruction");
        const nextPc = this.execute(decoded, record);
        this.pc = nextPc >>> 0;
        record.nextPc = this.pc;
        this.instructionCount += 1;
        this.csrs[0xc00] = this.instructionCount;
        this.csrs[0xc02] = this.instructionCount;
      } catch (error) {
        record.error = error.message;
        record.errorKind = error.kind || "error";
        this.isHalted = true;
      }
      record.isHalted = this.isHalted;
      return record;
    }

    execute(decoded, record) {
      const { name, rd, rs1, rs2, immediate } = decoded;
      const source1 = this.registers[rs1];
      const source2 = this.registers[rs2];
      const writeRegister = (value) => {
        const before = this.registers[rd];
        this.setRegister(rd, value);
        record.registerWrite = { number: rd, before, after: this.registers[rd] };
      };
      const nextPc = this.pc + 4;
      const INSTRUCTION_ALIGNMENT = 4;
      // 규격상 정렬되지 않은 점프 목적지는 다음 명령을 가져올 때가 아니라 점프 명령 자체의 예외다
      const checkTarget = (target) => {
        if ((target >>> 0) % INSTRUCTION_ALIGNMENT !== 0) throw new MachineError("점프 목적지가 4의 배수가 아님: 0x" + (target >>> 0).toString(16) + " (instruction address misaligned)", "misaligned-fetch");
        return target;
      };
      const branch = (condition) => {
        record.isBranch = true;
        record.isBranchTaken = condition;
        return condition ? checkTarget(this.pc + immediate) : nextPc;
      };
      const load = (size, isSigned) => {
        const address = (source1 + immediate) | 0;
        const value = this.readMemory(address, size, isSigned);
        record.memoryRead = { address: address >>> 0, size, value };
        writeRegister(value);
        return nextPc;
      };
      const store = (size) => {
        const address = (source1 + immediate) | 0;
        const before = this.readMemory(address, size, false);
        this.writeMemory(address, source2, size);
        record.memoryWrite = { address: address >>> 0, size, before, after: this.readMemory(address, size, false) };
        return nextPc;
      };
      switch (name) {
        case "lui": writeRegister(immediate << 12); return nextPc;
        case "auipc": writeRegister(this.pc + (immediate << 12)); return nextPc;
        case "jal": { const target = checkTarget(this.pc + immediate); writeRegister(nextPc); record.isBranch = true; record.isBranchTaken = true; return target; }
        case "jalr": { const target = checkTarget((source1 + immediate) & ~1); writeRegister(nextPc); record.isBranch = true; record.isBranchTaken = true; return target; }
        case "beq": return branch(source1 === source2);
        case "bne": return branch(source1 !== source2);
        case "blt": return branch(source1 < source2);
        case "bge": return branch(source1 >= source2);
        case "bltu": return branch((source1 >>> 0) < (source2 >>> 0));
        case "bgeu": return branch((source1 >>> 0) >= (source2 >>> 0));
        case "lb": return load(1, true);
        case "lh": return load(2, true);
        case "lw": return load(4, true);
        case "lbu": return load(1, false);
        case "lhu": return load(2, false);
        case "sb": return store(1);
        case "sh": return store(2);
        case "sw": return store(4);
        case "addi": writeRegister(source1 + immediate); return nextPc;
        case "slti": writeRegister(source1 < immediate ? 1 : 0); return nextPc;
        case "sltiu": writeRegister((source1 >>> 0) < (immediate >>> 0) ? 1 : 0); return nextPc;
        case "xori": writeRegister(source1 ^ immediate); return nextPc;
        case "ori": writeRegister(source1 | immediate); return nextPc;
        case "andi": writeRegister(source1 & immediate); return nextPc;
        case "slli": writeRegister(source1 << immediate); return nextPc;
        case "srli": writeRegister(source1 >>> immediate); return nextPc;
        case "srai": writeRegister(source1 >> immediate); return nextPc;
        case "add": writeRegister(source1 + source2); return nextPc;
        case "sub": writeRegister(source1 - source2); return nextPc;
        case "sll": writeRegister(source1 << (source2 & 31)); return nextPc;
        case "slt": writeRegister(source1 < source2 ? 1 : 0); return nextPc;
        case "sltu": writeRegister((source1 >>> 0) < (source2 >>> 0) ? 1 : 0); return nextPc;
        case "xor": writeRegister(source1 ^ source2); return nextPc;
        case "srl": writeRegister(source1 >>> (source2 & 31)); return nextPc;
        case "sra": writeRegister(source1 >> (source2 & 31)); return nextPc;
        case "or": writeRegister(source1 | source2); return nextPc;
        case "and": writeRegister(source1 & source2); return nextPc;
        case "mul": writeRegister(Math.imul(source1, source2)); return nextPc;
        case "mulh": writeRegister(Number((BigInt(source1) * BigInt(source2)) >> 32n)); return nextPc;
        case "mulhsu": writeRegister(Number((BigInt(source1) * BigInt(source2 >>> 0)) >> 32n)); return nextPc;
        case "mulhu": writeRegister(Number((BigInt(source1 >>> 0) * BigInt(source2 >>> 0)) >> 32n)); return nextPc;
        case "div": writeRegister(divideSigned(source1, source2).quotient); return nextPc;
        case "rem": writeRegister(divideSigned(source1, source2).remainder); return nextPc;
        case "divu": writeRegister(source2 === 0 ? -1 : Math.floor((source1 >>> 0) / (source2 >>> 0))); return nextPc;
        case "remu": writeRegister(source2 === 0 ? source1 : (source1 >>> 0) % (source2 >>> 0)); return nextPc;
        case "fence": case "fence.i": return nextPc;
        case "ebreak": this.isHalted = true; return nextPc;
        case "ecall": return this.systemCall(nextPc);
        case "csrrw": case "csrrs": case "csrrc": case "csrrwi": case "csrrsi": case "csrrci": {
          const address = decoded.csr;
          const before = this.csrs[address] || 0;
          const operand = name.endsWith("i") ? rs1 : source1;
          if (name === "csrrw" || name === "csrrwi") this.csrs[address] = operand;
          if ((name === "csrrs" || name === "csrrsi") && rs1 !== 0) this.csrs[address] = before | operand;
          if ((name === "csrrc" || name === "csrrci") && rs1 !== 0) this.csrs[address] = before & ~operand;
          writeRegister(before);
          return nextPc;
        }
        default: throw new MachineError("이 에뮬레이터가 실행하지 않는 명령: " + name, "illegal-instruction");
      }
    }

    systemCall(nextPc) {
      const callNumber = this.registers[17];
      const argument = this.registers[10];
      if (callNumber === SYSTEM_CALL.PRINT_INTEGER) this.output += String(argument);
      else if (callNumber === SYSTEM_CALL.PRINT_CHARACTER) this.output += String.fromCharCode(argument & 0xff);
      else if (callNumber === SYSTEM_CALL.PRINT_STRING) {
        let address = argument >>> 0;
        let text = "";
        for (let guard = 0; guard < 4096; guard += 1) { const byte = this.readMemory(address, 1, false); if (!byte) break; text += String.fromCharCode(byte); address += 1; }
        this.output += text;
      } else if (callNumber === SYSTEM_CALL.EXIT || callNumber === SYSTEM_CALL.EXIT_WITH_CODE) {
        this.isHalted = true;
        this.exitCode = callNumber === SYSTEM_CALL.EXIT ? 0 : argument;
      } else {
        throw new MachineError("모르는 시스템 호출 번호 a7=" + callNumber, "ecall");
      }
      return nextPc;
    }

    /** 멈출 때까지(또는 최대 횟수까지) 실행한다 */
    run(maximumSteps) {
      const limit = maximumSteps || 100000;
      let lastRecord = null;
      for (let count = 0; count < limit && !this.isHalted; count += 1) lastRecord = this.step();
      return lastRecord;
    }
  }

  class MachineError extends Error {
    constructor(message, kind) { super(message); this.kind = kind; }
  }

  /** RISC-V 규칙의 부호 있는 나눗셈: 0으로 나누면 몫 -1·나머지 피제수, 오버플로면 몫 피제수·나머지 0 */
  function divideSigned(dividend, divisor) {
    if (divisor === 0) return { quotient: -1, remainder: dividend };
    if (dividend === -2147483648 && divisor === -1) return { quotient: dividend, remainder: 0 };
    return { quotient: (dividend / divisor) | 0, remainder: dividend % divisor };
  }

  /* ------------------------------------------------------------ 어셈블리 강조 표시 (HTML) */
  function highlightAssembly(source) {
    const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const registerPattern = new RegExp("\\b(" + ABI_NAMES.join("|") + "|fp|x(?:[12]?[0-9]|3[01]))\\b", "g");
    return String(source).split("\n").map((line) => {
      const commentIndex = line.search(/#|\/\//);
      const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
      const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
      let html = escape(code)
        .replace(/^(\s*)([A-Za-z_.$][\w.$]*:)/, '$1<span class="label">$2</span>')
        .replace(/(^|\s)(\.[a-z]+)/, '$1<span class="directive">$2</span>')
        .replace(/^((?:\s*<span class="label">[^<]*<\/span>)?\s*)([a-z][a-z0-9.]*)(?=\s|$)/, '$1<span class="keyword">$2</span>')
        .replace(registerPattern, '<span class="register">$1</span>')
        .replace(/(?<![\w>])(-?(?:0x[0-9a-fA-F]+|\d+))\b/g, '<span class="number">$1</span>');
      if (comment) html += '<span class="comment">' + escape(comment) + "</span>";
      return html;
    }).join("\n");
  }

  const globalObject = typeof window !== "undefined" ? window : globalThis;
  globalObject.Riscv = {
    ABI_NAMES, REGISTER_DESCRIPTIONS, CALLEE_SAVED, OPCODES, OPCODE_NAMES, INSTRUCTIONS, INSTRUCTIONS_BY_NAME,
    IMMEDIATE_LAYOUTS, FORMAT_FIELDS, CSR_NAMES, SYSTEM_CALL, TEXT_BASE_ADDRESS, DATA_BASE_ADDRESS,
    registerNumber, bits, signExtend, scatterImmediate, gatherImmediate, encode, decode, disassemble,
    assemble, expandPseudoInstruction, splitUpperLower, parseInteger, divideSigned, highlightAssembly, Machine,
  };
  if (typeof module !== "undefined") module.exports = globalObject.Riscv;
})();
